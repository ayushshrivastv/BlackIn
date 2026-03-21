/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import ResponseWriter from '../class/response_writer';
import { Response } from 'express';
import { ChatRole, prisma } from '@lighthouse/database';
import { generator, objectStore } from '../services/init';
import { Chain, MODEL, STAGE } from '@lighthouse/types';
import { Contract as ContractType } from '@lighthouse/database';
import chalk from 'chalk';
import { resolvePrismaHttpError } from '../utils/prisma_error';

interface ByokConfig {
    provider: 'openai_compatible';
    model: string;
    apiKey: string;
    baseURL?: string;
}

export default class Contract {
    static async generate_with_template(
        res: Response,
        contract_id: string,
        user_id: string,
        template_id: string,
        instruction?: string,
        model?: MODEL,
        chain: Chain = Chain.SOLANA,
        byok?: ByokConfig,
    ) {
        try {
            // fetch the template data
            const template_files = await objectStore.get_template_files(template_id);

            // get template from the db too
            const template = await prisma.template.findUnique({
                where: {
                    id: template_id,
                },
            });
            console.log('template is : ', chalk.red(template));

            // checks if template_data doesn't exist
            if (
                !template_files ||
                !Array.isArray(template_files) ||
                !template ||
                !template.summarisedObject
            ) {
                ResponseWriter.not_found(res, 'Template not found');
                return;
            }

            if (template.chain !== chain) {
                ResponseWriter.validation_error(
                    res,
                    `Template belongs to ${template.chain} and cannot be used with ${chain}`,
                    'Template chain mismatch',
                );
                return;
            }

            // make the user the owner of the contract and add template's summarised-object
            await prisma.$transaction(async (tx) => {
                await tx.contract.create({
                    data: {
                        id: contract_id,
                        userId: user_id,
                        title: 'contractor',
                        contractType: 'CUSTOM',
                        chain,
                        summarisedObject: template.summarisedObject,
                    },
                });
            });

            // upload the template files to user's contract
            await objectStore.uploadContractFiles(
                contract_id,
                template_files,
                'no raw llm response for contracts generated from templates',
            );

            console.log('instruction found: ', instruction);

            if (!instruction) {
                await prisma.message.create({
                    data: {
                        contractId: contract_id,
                        templateId: template_id,
                        content: '',
                        role: 'TEMPLATE',
                    },
                });
                generator.create_stream(res);
                generator.send_sse(res, STAGE.END, { stage: 'End', data: template_files });
                ResponseWriter.stream.end(res);
                return;
            } else {
                // if yes then continue generation with the sent instruction

                // create user message

                await prisma.$transaction([
                    prisma.message.create({
                        data: {
                            contractId: contract_id,
                            templateId: template_id,
                            content: '',
                            role: 'TEMPLATE',
                        },
                    }),
                    prisma.message.create({
                        data: {
                            contractId: contract_id,
                            role: 'USER',
                            content: instruction,
                        },
                    }),
                ]);

                // start generating the contract
                generator.generate(
                    res,
                    'old',
                    instruction,
                    model || MODEL.GEMINI,
                    contract_id,
                    chain,
                    JSON.parse(template.summarisedObject),
                    byok,
                );
            }
        } catch (error) {
            console.error('Error in generate_contract_controller: ', error);
            const prismaError = resolvePrismaHttpError(error);
            if (!res.headersSent) {
                if (prismaError) {
                    ResponseWriter.error(
                        res,
                        prismaError.message,
                        prismaError.statusCode,
                        'PRISMA_ERROR',
                        prismaError.details,
                    );
                    return;
                }
                ResponseWriter.server_error(
                    res,
                    'Internal server error',
                    error instanceof Error ? error.message : undefined,
                );
                return;
            } else {
                ResponseWriter.stream.write(
                    res,
                    `data: ${JSON.stringify({
                        type: 'error',
                        error: prismaError?.message || 'Internal server error',
                    })}\n\n`,
                );
                ResponseWriter.stream.end(res);
            }
        }
    }

    static async generate_new_contract(
        res: Response,
        contract_id: string,
        user_id: string,
        instruction: string,
        model?: MODEL,
        chain: Chain = Chain.SOLANA,
        byok?: ByokConfig,
    ) {
        try {
            // create the contract and user message to generate the contract
            await prisma.$transaction(async (tx) => {
                await tx.contract.create({
                    data: {
                        id: contract_id,
                        userId: user_id,
                        title: 'contractor',
                        contractType: 'CUSTOM',
                        chain,
                    },
                });

                await tx.message.create({
                    data: {
                        contractId: contract_id,
                        role: 'USER',
                        content: instruction,
                    },
                });
            });

            // generate the new contract
            generator.generate(
                res,
                'new',
                instruction,
                model || MODEL.GEMINI,
                contract_id,
                chain,
                undefined,
                byok,
            );
        } catch (error) {
            console.error('Error in generate_contract_controller: ', error);
            const prismaError = resolvePrismaHttpError(error);
            if (!res.headersSent) {
                if (prismaError) {
                    ResponseWriter.error(
                        res,
                        prismaError.message,
                        prismaError.statusCode,
                        'PRISMA_ERROR',
                        prismaError.details,
                    );
                    return;
                }
                ResponseWriter.server_error(
                    res,
                    'Internal server error',
                    error instanceof Error ? error.message : undefined,
                );
                return;
            } else {
                ResponseWriter.stream.write(
                    res,
                    `data: ${JSON.stringify({
                        type: 'error',
                        error: prismaError?.message || 'Internal server error',
                    })}\n\n`,
                );
                ResponseWriter.stream.end(res);
            }
        }
    }

    static async continue_old_contract(
        res: Response,
        contract: ContractType,
        instruction: string,
        model?: MODEL,
        chain: Chain = Chain.SOLANA,
        byok?: ByokConfig,
    ) {
        try {
            // create user message
            await prisma.message.create({
                data: {
                    role: ChatRole.USER,
                    content: instruction,
                    contractId: contract.id,
                },
            });

            // call the generator with old chat
            generator.generate(
                res,
                'old',
                instruction,
                model || MODEL.GEMINI,
                contract.id,
                chain,
                JSON.parse(contract.summarisedObject || ''),
                byok,
            );
        } catch (error) {
            console.error('Error in generate_contract_controller: ', error);
            const prismaError = resolvePrismaHttpError(error);
            if (!res.headersSent) {
                if (prismaError) {
                    ResponseWriter.error(
                        res,
                        prismaError.message,
                        prismaError.statusCode,
                        'PRISMA_ERROR',
                        prismaError.details,
                    );
                    return;
                }
                ResponseWriter.server_error(
                    res,
                    'Internal server error',
                    error instanceof Error ? error.message : undefined,
                );
                return;
            } else {
                ResponseWriter.stream.write(
                    res,
                    `data: ${JSON.stringify({
                        type: 'error',
                        error: prismaError?.message || 'Internal server error',
                    })}\n\n`,
                );
                ResponseWriter.stream.end(res);
            }
        }
    }
}
