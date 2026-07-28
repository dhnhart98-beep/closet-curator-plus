const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeHttpUrl, retailerFromUrl, validateShoppingItem, filterAndSortShoppingItems,
} = require("../shopping-utils.js");

test("accepts secure product links and extracts the retailer domain", () => {
  assert.equal(normalizeHttpUrl("https://www.neimanmarcus.com/p/item"), "https://www.neimanmarcus.com/p/item");
  assert.equal(retailerFromUrl("https://www.neimanmarcus.com/p/item"), "neimanmarcus.com");
});

test("rejects invalid and unsafe URLs", () => {
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), "");
  assert.equal(normalizeHttpUrl("not a link"), "");
  assert.equal(validateShoppingItem({ name: "Bag", product_url: "not a link" }).valid, false);
});

test("validates product name, image URL, and prices", () => {
  const result = validateShoppingItem({
    name: "", external_image_url: "ftp://example.com/a.jpg", current_price: -10,
  });
  assert.deepEqual(Object.keys(result.errors).sort(), ["current_price", "external_image_url", "name"]);
});

test("filters by category, priority, purchased status, and search", () => {
  const rows = [
    { name: "Birkin", brand: "Hermès", category: "Handbag", priority: "High", purchased: false },
    { name: "Silk scarf", brand: "Hermès", category: "Accessory", priority: "Low", purchased: true },
  ];
  const result = filterAndSortShoppingItems(rows, {
    query: "hermès", category: "Handbag", priority: "High", purchased: "Not purchased",
  });
  assert.deepEqual(result.map((item) => item.name), ["Birkin"]);
});

test("sorts by newest, price, and priority", () => {
  const rows = [
    { name: "A", current_price: 900, priority: "Low", created_at: "2026-01-01" },
    { name: "B", current_price: 100, priority: "High", created_at: "2026-02-01" },
  ];
  assert.equal(filterAndSortShoppingItems(rows, { sort: "newest" })[0].name, "B");
  assert.equal(filterAndSortShoppingItems(rows, { sort: "price-low" })[0].name, "B");
  assert.equal(filterAndSortShoppingItems(rows, { sort: "priority" })[0].name, "B");
});
