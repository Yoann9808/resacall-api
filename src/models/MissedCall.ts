import mongoose, { Schema, Document } from 'mongoose';

export interface IMissedCall extends Document {}

const MissedCallSchema = new Schema({}, { timestamps: true });

export const MissedCall = mongoose.model<IMissedCall>('MissedCall', MissedCallSchema);
