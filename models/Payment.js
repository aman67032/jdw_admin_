const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cfOrderId: {
      type: String,
    },
    linkId: {
      type: String,
      required: true,
    },
    passType: {
      type: String,
      enum: ["day_pass", "open_studio", "all_access"],
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      default: "",
    },
    customerEmail: {
      type: String,
      default: "",
    },
    customerPhone: {
      type: String,
      default: "",
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAID", "EXPIRED", "CANCELLED", "PENDING"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      default: "",
    },
    paymentTime: {
      type: Date,
    },
    orderNote: {
      type: String,
      default: "",
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search
paymentSchema.index({
  customerName: "text",
  customerEmail: "text",
  orderId: "text",
});

module.exports = mongoose.model("Payment", paymentSchema);
