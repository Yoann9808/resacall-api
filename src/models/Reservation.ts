import mongoose, { Schema, Document } from 'mongoose';

export interface IReservation extends Document {}

const ReservationSchema = new Schema({}, { timestamps: true });

export const Reservation = mongoose.model<IReservation>('Reservation', ReservationSchema);
