import mongoose, { Schema, Types } from "mongoose";
export interface PlanDoc { _id: Types.ObjectId; code:string; name:string; seats:number; priceMonthly:number; active:boolean; }
const PlanSchema = new Schema<PlanDoc>({
  code: { type:String, unique:true }, name:String, seats:Number, priceMonthly:Number, active:{type:Boolean, default:true}
});
export const Plan = mongoose.model<PlanDoc>("Plan", PlanSchema);
