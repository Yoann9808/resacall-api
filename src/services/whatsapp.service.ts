import twilio from 'twilio';
import { env } from '../config/env';
import type { IRestaurant } from '../models/Restaurant';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendWhatsApp(
  restaurant: IRestaurant,
  to: string,
  body: string,
): Promise<void> {
  await client.messages.create({
    from: `whatsapp:${restaurant.whatsapp_number}`,
    to: `whatsapp:${to}`,
    body,
  });
}
