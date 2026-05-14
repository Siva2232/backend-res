/** Total intra-state GST on orders (CGST + SGST) — keep in sync with webfront `src/utils/gstRates.js`. */
const GST_TOTAL_RATE = 0.05;

module.exports = {
  GST_TOTAL_RATE,
  GST_CGST_RATE: GST_TOTAL_RATE / 2,
  GST_SGST_RATE: GST_TOTAL_RATE / 2,
  GST_INCLUSIVE_MULTIPLIER: 1 + GST_TOTAL_RATE,
};
