import mongoose, { Schema, Document } from 'mongoose';

export interface IRestaurant extends Document {}

const RestaurantSchema = new Schema({}, { timestamps: true });

export const Restaurant = mongoose.model<IRestaurant>('Restaurant', RestaurantSchema);
