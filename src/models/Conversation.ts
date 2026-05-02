import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {}

const ConversationSchema = new Schema({}, { timestamps: true });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
