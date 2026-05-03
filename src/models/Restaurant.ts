import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserEmbedded {
  _id: Types.ObjectId;
  email: string;
  role: 'owner' | 'staff';
  password_hash: string;
  notifications: {
    email_enabled: boolean;
  };
}

export interface IAvailability {
  service_id: string;
  label: string;
  days: number[];
  open_time: string;
  close_time: string;
  max_covers: number;
  slot_duration: number;
  booking_deadline: number;
  active: boolean;
}

export interface IException {
  date: string;
  closed: boolean;
  reason?: string;
}

export interface ISettings {
  welcome_message: string;
  languages: string[];
  default_language: string;
  auto_confirm: boolean;
  large_group_threshold: number;
  large_group_message: string;
  agent_instructions: string | null;
  confirmation_message: string;
}

export interface IRestaurant extends Document {
  name: string;
  status: 'onboarding' | 'pending_approval' | 'active' | 'suspended';
  phone_number: string;
  twilio_number_sid: string;
  whatsapp_number: string;
  template_sid: string;
  timezone: string;
  settings: ISettings;
  availability: IAvailability[];
  exceptions: IException[];
  users: IUserEmbedded[];
  created_at: Date;
  activated_at: Date | null;
}

const UserEmbeddedSchema = new Schema<IUserEmbedded>(
  {
    email: { type: String, required: true },
    role: { type: String, enum: ['owner', 'staff'], required: true },
    password_hash: { type: String, required: true, select: false },
    notifications: {
      email_enabled: { type: Boolean, default: true },
    },
  },
  { _id: true },
);

const AvailabilitySchema = new Schema<IAvailability>(
  {
    service_id: { type: String, required: true },
    label: { type: String, required: true },
    days: { type: [Number], required: true },
    open_time: { type: String, required: true },
    close_time: { type: String, required: true },
    max_covers: { type: Number, required: true },
    slot_duration: { type: Number, required: true },
    booking_deadline: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const ExceptionSchema = new Schema<IException>(
  {
    date: { type: String, required: true },
    closed: { type: Boolean, required: true },
    reason: { type: String },
  },
  { _id: false },
);

const SettingsSchema = new Schema<ISettings>(
  {
    welcome_message: { type: String, default: '' },
    languages: { type: [String], default: ['fr'] },
    default_language: { type: String, default: 'fr' },
    auto_confirm: { type: Boolean, default: false },
    large_group_threshold: { type: Number, default: 8 },
    large_group_message: { type: String, default: '' },
    agent_instructions: { type: String, default: null },
    confirmation_message: { type: String, default: '' },
  },
  { _id: false },
);

const RestaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['onboarding', 'pending_approval', 'active', 'suspended'],
      default: 'onboarding',
    },
    phone_number: { type: String, required: true, unique: true },
    twilio_number_sid: { type: String, default: '' },
    whatsapp_number: { type: String, default: '' },
    template_sid: { type: String, default: '' },
    timezone: { type: String, default: 'Europe/Paris' },
    settings: { type: SettingsSchema, default: () => ({}) },
    availability: { type: [AvailabilitySchema], default: [] },
    exceptions: { type: [ExceptionSchema], default: [] },
    users: { type: [UserEmbeddedSchema], default: [] },
    created_at: { type: Date, default: Date.now },
    activated_at: { type: Date, default: null },
  },
  { timestamps: false, versionKey: false },
);

export const Restaurant = mongoose.model<IRestaurant>('Restaurant', RestaurantSchema);
