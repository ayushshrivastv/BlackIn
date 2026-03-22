/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Request, Response } from 'express';
import ResponseWriter from '../../class/response_writer';
import { generate_contract } from '../../schemas/generate_contract_schema';
import { ChatRole, GenerationStatus, PlanType, prisma } from '@lighthouse/database';
import { Chain, MODEL } from '@lighthouse/types';
import Contract from '../../class/contract';
import { generator } from '../../services/init';
import { resolveAndGuardChain } from '../../chains/request_guard';
import { resolvePrismaHttpError } from '../../utils/prisma_error';

export default async function generate_contract_controller(req: Request, res: Response) {
    try {
        console.log('generate_contract_controller hit');
        // checking for valid user
        const user = req.user;
        if (!user) {
            console.log('unauthorised as user not found: ', user);
            ResponseWriter.unauthorized(res, 'Unauthorised');
            return;
        }

        const user_record = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true },
        });
        if (!user_record) {
            ResponseWriter.unauthorized(res, 'Session is not synced. Please sign in again.');
            return;
        }

        // checking for valid data
        const parsed_data = generate_contract.safeParse(req.body);
        if (!parsed_data.success) {
            console.log(`parsed data didn't match: `, req.body);
            ResponseWriter.error(res, 'Invalid data', 400);
            return;
        }

        const { contract_id, instruction, template_id, model, chain, byok } = parsed_data.data;
        const resolved_chain: Chain | null = resolveAndGuardChain(res, chain);
        if (!resolved_chain) {
            return;
        }

        // checking if the contract exists
        const existing_contract = await prisma.contract.findFirst({
            where: {
                id: contract_id,
                userId: user.id,
            },
            include: {
                messages: true,
            },
        });

        // check for claude model
        if (model === MODEL.CLAUDE) {
            const existing_user = await prisma.user.findFirst({
                where: {
                    id: user.id,
                    email: user.email,
                },
                include: {
                    subscription: true,
                },
            });

            const is_premium_user =
                existing_user?.subscription?.plan === PlanType.PREMIUM ||
                existing_user?.subscription?.plan === PlanType.PREMIUM_PLUS;

            if (!is_premium_user) {
                ResponseWriter.unauthorized(res, 'you are not subscribed to use premium feature.');
                return;
            }
        }

        if (existing_contract && existing_contract.chain !== resolved_chain) {
            ResponseWriter.validation_error(
                res,
                `Contract belongs to ${existing_contract.chain} and cannot be used with ${resolved_chain}`,
                'Chain mismatch',
            );
            return;
        }

        if (!existing_contract) {
            // contract is just been created
            // check if the user is asking with template
            if (template_id) {
                console.log('template id found for template visualization: ', template_id);

                Contract.generate_with_template(
                    res,
                    contract_id,
                    user.id,
                    template_id,
                    instruction,
                    model,
                    resolved_chain,
                    byok,
                );
            } else {
                // start generation if and only if the instruction is provided
                if (instruction) {
                    console.log('new contract generation');
                    Contract.generate_new_contract(
                        res,
                        contract_id,
                        user.id,
                        instruction,
                        model,
                        resolved_chain,
                        byok,
                    );
                } else {
                    // in here the contract should delete it self
                    ResponseWriter.error(res, 'Instruction not provided', 401);
                    return;
                }
            }
        } else if (existing_contract && !existing_contract.summarisedObject) {
            // if the user has sent some other msgs before, so the contract doesn't exist

            // return if the user is trying to send another message while generation
            if (existing_contract.generationStatus === GenerationStatus.GENERATING) {
                ResponseWriter.custom(res, 409, {
                    success: false,
                    meta: { timestamp: Date.now().toString() },
                    message: 'Repo already exists',
                });
                return;
            }

            // only start if instrution is provided
            if (instruction) {
                // create user message
                await prisma.message.create({
                    data: {
                        contractId: existing_contract.id,
                        role: ChatRole.USER,
                        content: instruction,
                    },
                });

                generator.generate(
                    res,
                    'new',
                    instruction,
                    model || MODEL.GEMINI,
                    existing_contract.id,
                    resolved_chain,
                    undefined,
                    byok,
                );
            }
        } else if (existing_contract && existing_contract.summarisedObject) {
            // start generation if and only if the instruction is provided

            // return if the user is trying to send another message while generation
            if (existing_contract.generationStatus === GenerationStatus.GENERATING) {
                ResponseWriter.custom(res, 409, {
                    success: false,
                    meta: { timestamp: Date.now().toString() },
                    message: 'Repo already exists',
                });
                return;
            }

            if (instruction) {
                Contract.continue_old_contract(
                    res,
                    existing_contract,
                    instruction,
                    model,
                    resolved_chain,
                    byok,
                );
            } else {
                ResponseWriter.error(res, 'Instruction not provided', 401);
                return;
            }
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
