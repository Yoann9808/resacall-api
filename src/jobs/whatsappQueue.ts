// BullMQ queue: whatsapp-outbound
// Payload: { restaurant_id, caller_number, missed_call_id }
// Retry: x3 with exponential backoff (1min / 5min / 15min)

export {};
