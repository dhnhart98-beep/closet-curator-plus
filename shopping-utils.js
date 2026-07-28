(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ShoppingUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const priorityOrder = { High: 0, Medium: 1, Low: 2 };

  function normalizeHttpUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function retailerFromUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return "";
    return new URL(normalized).hostname.replace(/^www\./i, "");
  }

  function validateShoppingItem(item) {
    const errors = {};
    if (!String(item.name || "").trim()) errors.name = "Enter a product name.";
    if (item.product_url && !normalizeHttpUrl(item.product_url)) {
      errors.product_url = "Enter a complete link beginning with http:// or https://.";
    }
    if (item.external_image_url && !normalizeHttpUrl(item.external_image_url)) {
      errors.external_image_url = "Enter a complete image link beginning with http:// or https://.";
    }
    ["current_price", "target_price"].forEach((field) => {
      if (item[field] !== "" && item[field] != null && (!Number.isFinite(Number(item[field])) || Number(item[field]) < 0)) {
        errors[field] = "Enter a price of zero or more.";
      }
    });
    if (String(item.desired_size || "").length > 80) errors.desired_size = "Keep the desired size under 80 characters.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function filterAndSortShoppingItems(rows, options) {
    const settings = options || {};
    const query = String(settings.query || "").trim().toLowerCase();
    const filtered = (rows || []).filter((item) => {
      const searchable = [
        item.name, item.brand, item.retailer_name, item.seller_marketplace,
        item.category, item.desired_color, item.notes,
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) &&
        (!settings.category || settings.category === "All" || item.category === settings.category) &&
        (!settings.priority || settings.priority === "All" || item.priority === settings.priority) &&
        (!settings.purchased || settings.purchased === "All" ||
          (settings.purchased === "Purchased" ? item.purchased : !item.purchased));
    });

    return filtered.sort((a, b) => {
      if (settings.sort === "price-low") return Number(a.current_price || 0) - Number(b.current_price || 0);
      if (settings.sort === "price-high") return Number(b.current_price || 0) - Number(a.current_price || 0);
      if (settings.sort === "priority") {
        return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  return { normalizeHttpUrl, retailerFromUrl, validateShoppingItem, filterAndSortShoppingItems };
});
