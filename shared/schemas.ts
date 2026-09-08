import { z } from 'zod';

export const telegramUserSchema = z.object({
  id: z.number().or(z.string()),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
}).passthrough();

export const orderItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
  subtotal: z.number().optional(),
}).passthrough();

export const orderRequestSchema = z.object({
  telegramId: z.string().or(z.number()).optional(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  comment: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(orderItemSchema),
  total: z.number().optional(),
}).passthrough();

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type TelegramUser = z.infer<typeof telegramUserSchema>;