import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string | Record<string, unknown>[];
  ts: Date;
}

export interface IAgentLog {
  step: string;
  tool_name?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  ts: Date;
}

export interface IExtracted {
  customer_name: string | null;
  party_size: number | null;
  preferred_date: Date | null;
  special_request: string | null;
}

export interface IConversation extends Document {
  restaurant_id: Types.ObjectId;
  missed_call_id: Types.ObjectId;
  customer_phone: string;
  status: 'active' | 'completed' | 'abandoned' | 'taken_over';
  detected_language: string;
  taken_over_by: Types.ObjectId | null;
  messages: IMessage[];
  agent_log: IAgentLog[];
  extracted: IExtracted;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: Schema.Types.Mixed, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false },
);

const AgentLogSchema = new Schema<IAgentLog>(
  {
    step: { type: String, required: true },
    tool_name: { type: String },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    error: { type: String },
    ts: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ExtractedSchema = new Schema<IExtracted>(
  {
    customer_name: { type: String, default: null },
    party_size: { type: Number, default: null },
    preferred_date: { type: Date, default: null },
    special_request: { type: String, default: null },
  },
  { _id: false },
);

const ConversationSchema = new Schema<IConversation>(
  {
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    missed_call_id: { type: Schema.Types.ObjectId, ref: 'MissedCall', required: true },
    customer_phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned', 'taken_over'],
      default: 'active',
    },
    detected_language: { type: String, default: 'fr' },
    taken_over_by: { type: Schema.Types.ObjectId, default: null },
    messages: { type: [MessageSchema], default: [] },
    agent_log: { type: [AgentLogSchema], default: [] },
    extracted: { type: ExtractedSchema, default: () => ({}) },
    expires_at: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  },
);

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
