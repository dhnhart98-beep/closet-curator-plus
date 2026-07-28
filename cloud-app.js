(() => {
  "use strict";

  const config = window.CLOSET_CURATOR_CONFIG || {};
  const configured =
    /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") &&
    config.supabaseAnonKey &&
    !config.supabaseAnonKey.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]
    );
  const money = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  const icons = {
    Top: "👚", Bottom: "👖", Dress: "👗", Outerwear: "🧥",
    Shoes: "👠", Accessory: "💍", Handbag: "👜", Beauty: "💄",
  };
  const shoppingUtils = window.ShoppingUtils;
  let removeExistingShoppingImage = false;

  let client;
  let user;
  let items = [];
  let looks = [];
  let planner = {};
  let shopping = [];
  let current = {};
  const cycleIndex = {};
  let refreshTimer;

  function status(message, error = false) {
    $("authStatus").textContent = message;
    $("authStatus").classList.toggle("error", error);
  }

  function syncStatus(message) {
    $("syncBadge").textContent = message;
  }

  function requireClient() {
    if (!configured) {
      status("Supabase setup is required. Follow SETUP_SUPABASE.md, then update config.js.", true);
      return false;
    }
    return true;
  }

  async function signIn(event) {
    event.preventDefault();
    if (!requireClient()) return;
    status("Signing in…");
    const { error } = await client.auth.signInWithPassword({
      email: $("authEmail").value.trim(),
      password: $("authPassword").value,
    });
    if (error) status(error.message, true);
  }

  async function signUp() {
    if (!requireClient() || !$("authForm").reportValidity()) return;
    status("Creating your account…");
    const { error } = await client.auth.signUp({
      email: $("authEmail").value.trim(),
      password: $("authPassword").value,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    status(
      error ? error.message : "Account created. Check your email to confirm, then sign in.",
      Boolean(error)
    );
  }

  async function resetPassword() {
    if (!requireClient()) return;
    const email = $("authEmail").value.trim();
    if (!email) return status("Enter your email address first.", true);
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split("#")[0],
    });
    status(error ? error.message : "Password reset email sent.", Boolean(error));
  }

  async function loadPhotos(rows) {
    await Promise.all(rows.map(async (item) => {
      item.image = "";
      if (!item.photo_path) return;
      const { data, error } = await client.storage
        .from("clothing-photos")
        .createSignedUrl(item.photo_path, 3600);
      if (!error) item.image = data.signedUrl;
    }));
  }

  async function loadShoppingPhotos(rows) {
    await Promise.all(rows.map(async (item) => {
      item.image = item.external_image_url || "";
      if (!item.image_path) return;
      const { data, error } = await client.storage
        .from("clothing-photos")
        .createSignedUrl(item.image_path, 3600);
      if (!error) item.image = data.signedUrl;
    }));
  }

  async function loadCloudData() {
    if (!user) return;
    syncStatus("Syncing…");
    const [itemResult, outfitResult, linkResult, plannerResult, shoppingResult] =
      await Promise.all([
        client.from("closet_items").select("*").order("created_at", { ascending: false }),
        client.from("outfits").select("*").order("created_at", { ascending: false }),
        client.from("outfit_items").select("*"),
        client.from("planner_entries").select("*"),
        client.from("shopping_list_items").select("*").order("created_at", { ascending: false }),
      ]);
    const firstError = [
      itemResult, outfitResult, linkResult, plannerResult, shoppingResult,
    ].find((result) => result.error)?.error;
    if (firstError) {
      syncStatus("Sync error");
      alert(`Could not sync: ${firstError.message}`);
      return;
    }

    items = itemResult.data.map((row) => ({
      ...row,
      price: Number(row.purchase_price || 0),
      wears: Number(row.wear_count || 0),
    }));
    await loadPhotos(items);
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    looks = outfitResult.data.map((outfit) => {
      const linked = linkResult.data
        .filter((link) => link.outfit_id === outfit.id)
        .sort((a, b) => a.position - b.position)
        .map((link) => byId[link.closet_item_id])
        .filter(Boolean);
      return {
        ...outfit,
        items: Object.fromEntries(linked.map((item) => [item.category, item])),
      };
    });
    planner = Object.fromEntries(
      plannerResult.data.map((entry) => [
        entry.planned_for,
        looks.find((look) => look.id === entry.outfit_id)?.name || "Saved outfit",
      ])
    );
    shopping = shoppingResult.data.map((row) => ({
      ...row,
      current_price: row.current_price == null ? null : Number(row.current_price),
      target_price: row.target_price == null ? null : Number(row.target_price),
    }));
    await loadShoppingPhotos(shopping);
    renderAll();
    syncStatus("Synced");
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadCloudData, 350);
  }

  function subscribe() {
    client
      .channel(`closet-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "closet_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "outfits" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "outfit_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "planner_entries" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_list_items" }, scheduleRefresh)
      .subscribe();
  }

  function card(item) {
    return `<article class="card">
      <button class="heart" onclick="toggleFav('${item.id}')">${item.favorite ? "♥" : "♡"}</button>
      <div class="image">${item.image
        ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">`
        : (icons[item.category] || "✦")}</div>
      <div class="body"><div class="name">${esc(item.name)}</div>
      <div class="meta"><span>${esc(item.category)}</span><span>${esc(item.color)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px;gap:7px">
        <span class="tag">${esc(item.season)}</span>
        <span>
          <button class="btn ghost" style="padding:6px 8px;font-size:11px" onclick="editItem('${item.id}')">Edit</button>
          <button class="btn danger" style="padding:6px 8px;font-size:11px" onclick="removeItem('${item.id}')">Delete</button>
        </span>
      </div></div></article>`;
  }

  function renderStats() {
    $("statTotal").textContent = items.length;
    $("statFav").textContent = items.filter((item) => item.favorite).length;
    $("statLooks").textContent = looks.length;
    $("statValue").textContent = money(items.reduce((sum, item) => sum + item.price, 0));
    const counts = {};
    items.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });
    const largest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    $("insights").innerHTML = `
      <div class="insight"><strong>${largest ? esc(largest[0]) : "—"}</strong><br><span class="subtitle">Largest category${largest ? ` with ${largest[1]} pieces` : ""}</span></div>
      <div class="insight"><strong>${items.filter((item) => item.wears === 0).length}</strong><br><span class="subtitle">Items not yet worn</span></div>
      <div class="insight"><strong>${items.filter((item) => item.favorite).length}</strong><br><span class="subtitle">Reliable favorites</span></div>`;
  }

  function renderCloset() {
    const query = $("search").value.toLowerCase();
    const category = $("filterCategory").value;
    const season = $("filterSeason").value;
    const filtered = items.filter((item) =>
      `${item.name} ${item.color || ""} ${item.brand || ""} ${item.notes || ""}`
        .toLowerCase().includes(query) &&
      (category === "All" || item.category === category) &&
      (season === "All" || item.season === season)
    );
    $("closetGrid").innerHTML = filtered.length
      ? filtered.map(card).join("")
      : '<div class="empty">No matching pieces.</div>';
    const beauty = items.filter((item) => ["Beauty", "Accessory", "Handbag"].includes(item.category));
    $("beautyGrid").innerHTML = beauty.length
      ? beauty.map(card).join("")
      : '<div class="empty">Add beauty, jewelry, or handbags.</div>';
  }

  function renderSlots() {
    document.querySelectorAll(".slot").forEach((element) => {
      const item = current[element.dataset.slot];
      element.classList.toggle("filled", Boolean(item));
      element.innerHTML = item
        ? `<div class="slot-preview">${item.image
          ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">`
          : `<span class="slot-icon">${icons[item.category] || "✦"}</span>`}
          <span><strong>${esc(item.name)}</strong><small style="display:block;margin-top:4px">${esc(item.color || item.category)}</small></span></div>`
        : `Choose ${element.dataset.slot.toLowerCase()}`;
    });
  }

  function cycle(type) {
    const choices = items.filter((item) => item.category === type);
    if (!choices.length) return alert(`Add a ${type.toLowerCase()} first.`);
    cycleIndex[type] = ((cycleIndex[type] ?? -1) + 1) % choices.length;
    current[type] = choices[cycleIndex[type]];
    renderSlots();
  }

  function surprise() {
    current = {};
    ["Top", "Bottom", "Shoes", "Outerwear", "Accessory", "Handbag"].forEach((type) => {
      const choices = items.filter((item) => item.category === type);
      if (choices.length) current[type] = choices[Math.floor(Math.random() * choices.length)];
    });
    const dresses = items.filter((item) => item.category === "Dress");
    if (dresses.length && Math.random() > 0.55) {
      current = {
        Dress: dresses[Math.floor(Math.random() * dresses.length)],
        Shoes: current.Shoes, Accessory: current.Accessory,
        Handbag: current.Handbag, Outerwear: current.Outerwear,
      };
    }
    renderSlots();
  }

  async function saveLook() {
    const selected = Object.values(current).filter(Boolean);
    if (!selected.length) return alert("Build a look first.");
    const name = prompt("Name this look:", `Look ${looks.length + 1}`) || `Look ${looks.length + 1}`;
    const { data, error } = await client
      .from("outfits").insert({ user_id: user.id, name }).select().single();
    if (error) return alert(error.message);
    const links = selected.map((item, position) => ({
      user_id: user.id, outfit_id: data.id, closet_item_id: item.id, position,
    }));
    const linkResult = await client.from("outfit_items").insert(links);
    if (linkResult.error) return alert(linkResult.error.message);
    await loadCloudData();
  }

  function renderLooks() {
    $("looksGrid").innerHTML = looks.length
      ? looks.map((look) => {
        const pieces = Object.entries(look.items).filter(([, item]) => item);
        const collage = pieces.map(([type, item]) => `<div class="look-piece">
          ${item.image
            ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">`
            : `<span class="look-icon">${icons[item.category] || "✦"}</span>`}
          <span class="look-piece-label">${esc(type)} · ${esc(item.name)}</span>
        </div>`).join("");
        const saved = look.created_at
          ? new Date(look.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
          : "";
        return `<article class="card"><div class="look-collage">${collage}</div><div class="body">
          <div class="name">${esc(look.name)}</div>
          ${saved ? `<div class="look-date">Saved ${saved}</div>` : ""}
          <p class="subtitle" style="font-size:12px;line-height:1.5">${pieces
            .map(([type, item]) => `${esc(type)}: ${esc(item.name)}`).join("<br>")}</p>
          <button class="btn danger" onclick="deleteLook('${look.id}')">Delete</button>
        </div></article>`;
      }).join("")
      : '<div class="empty">Build and save an outfit to see its visual collage here.</div>';
  }

  function weekDates() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return date;
    });
  }

  function renderPlanner() {
    const formatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });
    $("plannerGrid").innerHTML = weekDates().map((date) => {
      const key = date.toISOString().slice(0, 10);
      return `<div class="day"><strong>${formatter.format(date)}</strong>
        <p>${esc(planner[key] || "No outfit planned")}</p>
        <button class="btn ghost" style="padding:7px 8px;font-size:11px" onclick="assignDay('${key}')">Assign look</button></div>`;
    }).join("");
  }

  async function assignDay(date) {
    if (!looks.length) return alert("Save at least one look first.");
    const choice = prompt(`Choose a look number:\n${looks.map((look, index) => `${index + 1}. ${look.name}`).join("\n")}`);
    const look = looks[Number(choice) - 1];
    if (!look) return;
    const { error } = await client.from("planner_entries").upsert({
      user_id: user.id, planned_for: date, outfit_id: look.id,
    }, { onConflict: "user_id,planned_for" });
    if (error) return alert(error.message);
    await loadCloudData();
  }

  function renderGaps() {
    const target = { Top: 5, Bottom: 4, Dress: 3, Outerwear: 2, Shoes: 4, Accessory: 5, Handbag: 2 };
    const counts = {};
    items.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });
    const gaps = Object.entries(target).filter(([category, count]) => (counts[category] || 0) < count);
    $("gapList").innerHTML = gaps.length
      ? gaps.map(([category, count]) => `<div class="list-row"><span>Add a versatile ${category.toLowerCase()}</span><span class="tag">${count - (counts[category] || 0)} suggested</span></div>`).join("")
      : '<div class="empty">Your core categories are well represented.</div>';
    const visible = shoppingUtils.filterAndSortShoppingItems(shopping, {
      query: $("shoppingSearch").value, category: $("shoppingCategory").value,
      priority: $("shoppingPriority").value, purchased: $("shoppingPurchased").value,
      sort: $("shoppingSort").value,
    });
    $("shoppingList").innerHTML = visible.length
      ? visible.map((item) => {
        const safeUrl = shoppingUtils.normalizeHttpUrl(item.product_url);
        const retailer = item.retailer_name || shoppingUtils.retailerFromUrl(safeUrl);
        const preferences = [
          item.desired_size && `Size ${item.desired_size}`, item.desired_color,
        ].filter(Boolean);
        return `<article class="shopping-card${item.purchased ? " purchased" : ""}">
          <div class="shopping-thumb">${item.image
            ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" onerror="this.parentNode.textContent='✦'">`
            : "✦"}</div>
          <div class="shopping-main">
            <div class="shopping-title"><div><div class="name">${esc(item.name)}</div>
              <div class="subtitle">${esc(item.brand || "Brand not specified")}${retailer ? ` · ${esc(retailer)}` : ""}</div></div>
              <span class="tag">${item.purchased ? "Purchased" : esc(item.priority || "Medium")}</span>
            </div>
            <div class="shopping-detail">
              ${item.current_price != null ? `<span class="shopping-price">${money(item.current_price)}</span>` : ""}
              ${item.target_price != null ? `<span>Target ${money(item.target_price)}</span>` : ""}
              ${item.category ? `<span>${esc(item.category)}</span>` : ""}
              ${preferences.length ? `<span>${esc(preferences.join(" · "))}</span>` : ""}
            </div>
            <div class="shopping-actions">
              ${safeUrl ? `<a class="btn secondary" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer external">View Product</a>` : ""}
              <button class="btn ghost" onclick="editShopping('${item.id}')">Edit</button>
              <button class="btn ghost" onclick="toggleShoppingPurchased('${item.id}')">${item.purchased ? "Mark not purchased" : "Mark purchased"}</button>
              <button class="btn danger" onclick="removeShopping('${item.id}')">Delete</button>
            </div>
          </div>
        </article>`;
      }).join("")
      : '<div class="empty">Your shopping list is empty.</div>';
  }

  function renderAnalytics() {
    const sorted = [...items].sort((a, b) =>
      a.price / Math.max(1, a.wears) - b.price / Math.max(1, b.wears)
    );
    $("analyticsList").innerHTML = sorted.length
      ? sorted.map((item) => `<div class="list-row"><div><strong>${esc(item.name)}</strong>
        <div class="subtitle">${item.wears} wears · ${money(item.price)}</div></div>
        <span class="tag">${money(item.price / Math.max(1, item.wears))}/wear</span></div>`).join("")
      : '<div class="empty">Add purchase prices and wear counts to see analytics.</div>';
  }

  function buildPacking() {
    const days = Math.max(1, Number($("tripDays").value) || 1);
    const climate = $("tripClimate").value;
    const type = $("tripType").value;
    const counts = { Top: Math.min(days, 5), Bottom: Math.ceil(days / 2), Dress: type.includes("Birthday") ? 2 : 1, Shoes: 2, Accessory: 3, Beauty: 4, Handbag: 1 };
    if (climate === "Cold") counts.Outerwear = 2;
    if (climate === "Rainy") counts.Outerwear = 1;
    const picks = [];
    Object.entries(counts).forEach(([category, count]) =>
      items.filter((item) => item.category === category).slice(0, count).forEach((item) => picks.push(item.name))
    );
    $("packingList").innerHTML = picks.length
      ? picks.map((name) => `<div class="list-row"><span>${esc(name)}</span><input type="checkbox"></div>`).join("")
      : '<div class="empty">Add more closet items to build a packing list.</div>';
  }

  function generateStyle() {
    const temperature = Number($("temperature").value) || 70;
    const weather = $("weather").value;
    const occasion = $("occasion").value;
    const mood = $("mood").value;
    const season = temperature < 55 ? "Winter" : temperature > 82 ? "Summer" : "Year-round";
    const eligible = items.filter((item) =>
      (item.season === "Year-round" || item.season === season) &&
      (item.occasion === occasion || item.occasion === "Everyday")
    );
    const pick = (category) => {
      const choices = eligible.filter((item) => item.category === category);
      return choices[Math.floor(Math.random() * choices.length)];
    };
    const dress = ["Formal", "Night out"].includes(occasion) ? pick("Dress") : null;
    const recommendation = (dress
      ? [dress, pick("Shoes"), pick("Accessory"), pick("Handbag"), weather === "Rainy" ? pick("Outerwear") : null]
      : [pick("Top"), pick("Bottom"), pick("Shoes"), pick("Accessory"), pick("Handbag"), temperature < 65 ? pick("Outerwear") : null]
    ).filter(Boolean);
    current = Object.fromEntries(recommendation.map((item) => [item.category, item]));
    renderSlots();
    $("styleResult").textContent = recommendation.length
      ? `${mood} ${occasion.toLowerCase()} look for ${temperature}°F and ${weather.toLowerCase()} weather.`
      : "Add more tagged items to receive a complete recommendation.";
    $("stylePieces").innerHTML = recommendation.map((item) => `<span class="tag">${esc(item.name)}</span>`).join("");
  }

  async function uploadPhoto(file, itemId) {
    if (!file) return null;
    if (file.size > 12 * 1024 * 1024) throw new Error("Please choose an image smaller than 12 MB.");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${user.id}/${itemId}.${extension}`;
    const { error } = await client.storage
      .from("clothing-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    return path;
  }

  async function addItem(event) {
    event.preventDefault();
    const id = crypto.randomUUID();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const photoPath = await uploadPhoto($("itemImage").files[0], id);
      const { error } = await client.from("closet_items").insert({
        id,
        user_id: user.id,
        name: $("itemName").value.trim(),
        category: $("itemCategory").value,
        color: $("itemColor").value.trim() || null,
        season: $("itemSeason").value,
        occasion: $("itemOccasion").value,
        brand: $("itemBrand").value.trim() || null,
        purchase_price: Number($("itemPrice").value) || 0,
        wear_count: Number($("itemWears").value) || 0,
        notes: $("itemNotes").value.trim() || null,
        photo_path: photoPath,
      });
      if (error) throw error;
      event.target.reset();
      $("modal").classList.remove("open");
      await loadCloudData();
    } catch (error) {
      alert(`Could not save item: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Add to closet";
    }
  }

  async function editItem(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const name = prompt("Item name:", item.name);
    if (!name) return;
    const color = prompt("Color:", item.color || "") ?? item.color;
    const brand = prompt("Brand:", item.brand || "") ?? item.brand;
    const wears = prompt("Number of wears:", String(item.wears));
    const { error } = await client.from("closet_items").update({
      name: name.trim(), color: color?.trim() || null, brand: brand?.trim() || null,
      wear_count: Math.max(0, Number(wears) || 0),
    }).eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  async function toggleFav(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const { error } = await client.from("closet_items")
      .update({ favorite: !item.favorite }).eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  async function removeItem(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item || !confirm("Remove this item and its private photo?")) return;
    if (item.photo_path) {
      const result = await client.storage.from("clothing-photos").remove([item.photo_path]);
      if (result.error) return alert(result.error.message);
    }
    const { error } = await client.from("closet_items").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  async function deleteLook(id) {
    if (!confirm("Delete this saved look?")) return;
    const { error } = await client.from("outfits").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  function shoppingFormData() {
    const productUrl = $("shoppingProductUrl").value.trim();
    return {
      name: $("shoppingName").value.trim(),
      brand: $("shoppingBrand").value.trim() || null,
      product_url: productUrl || null,
      external_image_url: $("shoppingImageUrl").value.trim() || null,
      retailer_name: $("shoppingRetailer").value.trim() ||
        shoppingUtils.retailerFromUrl(productUrl) || null,
      seller_marketplace: $("shoppingSeller").value.trim() || null,
      current_price: $("shoppingCurrentPrice").value === "" ? null : Number($("shoppingCurrentPrice").value),
      target_price: $("shoppingTargetPrice").value === "" ? null : Number($("shoppingTargetPrice").value),
      category: $("shoppingItemCategory").value || null,
      desired_size: $("shoppingSize").value.trim() || null,
      desired_color: $("shoppingColor").value.trim() || null,
      condition: $("shoppingCondition").value || null,
      hardware_color: $("shoppingHardware").value.trim() || null,
      authenticity_status: $("shoppingAuthenticity").value || null,
      priority: $("shoppingItemPriority").value,
      purchased: $("shoppingItemPurchased").checked,
      notes: $("shoppingNotes").value.trim() || null,
    };
  }

  function showShoppingErrors(errors) {
    document.querySelectorAll("[data-error]").forEach((node) => {
      node.textContent = errors[node.dataset.error] || "";
      node.classList.toggle("visible", Boolean(errors[node.dataset.error]));
    });
  }

  function updateShoppingPreview(url) {
    const preview = $("shoppingImagePreview");
    const safeUrl = shoppingUtils.normalizeHttpUrl(url);
    preview.innerHTML = safeUrl
      ? `<img src="${esc(safeUrl)}" alt="Product image preview" onerror="this.parentNode.textContent='Image unavailable'">`
      : "No image";
  }

  function resetShoppingForm() {
    $("shoppingForm").reset();
    $("shoppingItemId").value = "";
    $("shoppingModalTitle").textContent = "Add shopping item";
    $("saveShoppingItem").textContent = "Save shopping item";
    removeExistingShoppingImage = false;
    showShoppingErrors({});
    updateShoppingPreview("");
  }

  function openShoppingModal() {
    resetShoppingForm();
    $("shoppingModal").classList.add("open");
  }

  function editShopping(id) {
    const item = shopping.find((entry) => entry.id === id);
    if (!item) return;
    resetShoppingForm();
    $("shoppingItemId").value = item.id;
    $("shoppingModalTitle").textContent = "Edit shopping item";
    $("saveShoppingItem").textContent = "Save changes";
    const values = {
      shoppingName: item.name, shoppingBrand: item.brand, shoppingProductUrl: item.product_url,
      shoppingRetailer: item.retailer_name, shoppingSeller: item.seller_marketplace,
      shoppingCurrentPrice: item.current_price, shoppingTargetPrice: item.target_price,
      shoppingItemCategory: item.category, shoppingSize: item.desired_size,
      shoppingColor: item.desired_color, shoppingItemPriority: item.priority || "Medium",
      shoppingCondition: item.condition, shoppingHardware: item.hardware_color,
      shoppingAuthenticity: item.authenticity_status, shoppingImageUrl: item.external_image_url,
      shoppingNotes: item.notes,
    };
    Object.entries(values).forEach(([idKey, value]) => { $(idKey).value = value ?? ""; });
    $("shoppingItemPurchased").checked = Boolean(item.purchased);
    updateShoppingPreview(item.image);
    $("shoppingModal").classList.add("open");
  }

  async function compressShoppingImage(file) {
    if (!file) return null;
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
    if (!file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
    const bitmap = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
    bitmap.close?.();
    if (!blob) throw new Error("This image could not be prepared. Try a JPG or PNG.");
    return blob;
  }

  async function uploadShoppingImage(file, itemId) {
    const blob = await compressShoppingImage(file);
    if (!blob) return null;
    const path = `${user.id}/shopping-list/${itemId}/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from("clothing-photos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  }

  async function saveShopping(event) {
    event.preventDefault();
    const values = shoppingFormData();
    const validation = shoppingUtils.validateShoppingItem(values);
    showShoppingErrors(validation.errors);
    if (!validation.valid) return;

    const id = $("shoppingItemId").value || crypto.randomUUID();
    const existing = shopping.find((entry) => entry.id === id);
    const file = $("shoppingImage").files[0];
    const button = $("saveShoppingItem");
    button.disabled = true;
    button.textContent = file ? "Uploading image…" : "Saving…";
    let newPath = null;
    try {
      if (file) newPath = await uploadShoppingImage(file, id);
      const oldPath = existing?.image_path || null;
      const payload = {
        ...values, id, user_id: user.id,
        image_path: newPath || (removeExistingShoppingImage ? null : oldPath),
        completed: values.purchased,
      };
      const result = existing
        ? await client.from("shopping_list_items").update(payload).eq("id", id)
        : await client.from("shopping_list_items").insert(payload);
      if (result.error) throw result.error;
      if (oldPath && (newPath || removeExistingShoppingImage)) {
        const removal = await client.storage.from("clothing-photos").remove([oldPath]);
        if (removal.error) alert(`Item saved, but the old image could not be removed: ${removal.error.message}`);
      }
      $("shoppingModal").classList.remove("open");
      resetShoppingForm();
      await loadCloudData();
    } catch (error) {
      if (newPath) await client.storage.from("clothing-photos").remove([newPath]);
      alert(`Could not save shopping item: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = existing ? "Save changes" : "Save shopping item";
    }
  }

  async function toggleShoppingPurchased(id) {
    const item = shopping.find((entry) => entry.id === id);
    if (!item) return;
    const purchased = !item.purchased;
    const { error } = await client.from("shopping_list_items")
      .update({ purchased, completed: purchased }).eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  async function removeShopping(id) {
    const item = shopping.find((entry) => entry.id === id);
    if (!item || !confirm("Delete this shopping item and its private image?")) return;
    if (item.image_path) {
      const removal = await client.storage.from("clothing-photos").remove([item.image_path]);
      if (removal.error) return alert(`Could not remove image: ${removal.error.message}`);
    }
    const { error } = await client.from("shopping_list_items").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadCloudData();
  }

  function renderAll() {
    renderStats(); renderCloset(); renderLooks(); renderPlanner();
    renderGaps(); renderAnalytics(); renderSlots();
  }

  function wireInterface() {
    document.querySelectorAll(".nav").forEach((button) => {
      button.onclick = () => {
        document.querySelectorAll(".nav").forEach((entry) => entry.classList.remove("active"));
        button.classList.add("active");
        document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
        $(button.dataset.view).classList.remove("hidden");
      };
    });
    document.querySelectorAll(".slot").forEach((slot) => { slot.onclick = () => cycle(slot.dataset.slot); });
    document.querySelectorAll(".openAdd").forEach((button) => { button.onclick = () => $("modal").classList.add("open"); });
    $("closeModal").onclick = () => $("modal").classList.remove("open");
    $("modal").onclick = (event) => { if (event.target === $("modal")) $("modal").classList.remove("open"); };
    $("authForm").onsubmit = signIn;
    $("signUpBtn").onclick = signUp;
    $("resetPasswordBtn").onclick = resetPassword;
    $("signOutBtn").onclick = () => client.auth.signOut();
    $("itemForm").onsubmit = addItem;
    $("surprise").onclick = surprise;
    $("saveLook").onclick = saveLook;
    $("generateStyle").onclick = generateStyle;
    $("buildPacking").onclick = buildPacking;
    $("search").oninput = renderCloset;
    $("filterCategory").onchange = renderCloset;
    $("filterSeason").onchange = renderCloset;
    $("openShoppingModal").onclick = openShoppingModal;
    $("closeShoppingModal").onclick = () => $("shoppingModal").classList.remove("open");
    $("shoppingModal").onclick = (event) => {
      if (event.target === $("shoppingModal")) $("shoppingModal").classList.remove("open");
    };
    $("shoppingForm").onsubmit = saveShopping;
    $("shoppingProductUrl").onblur = () => {
      if (!$("shoppingRetailer").value.trim()) {
        $("shoppingRetailer").value = shoppingUtils.retailerFromUrl($("shoppingProductUrl").value);
      }
    };
    $("shoppingImageUrl").oninput = () => updateShoppingPreview($("shoppingImageUrl").value);
    $("shoppingImage").onchange = () => {
      const file = $("shoppingImage").files[0];
      if (file) updateShoppingPreview(URL.createObjectURL(file));
    };
    $("removeShoppingImage").onclick = () => {
      removeExistingShoppingImage = true;
      $("shoppingImage").value = "";
      $("shoppingImageUrl").value = "";
      updateShoppingPreview("");
    };
    ["shoppingSearch", "shoppingCategory", "shoppingPriority", "shoppingPurchased", "shoppingSort"]
      .forEach((id) => { $(id).oninput = renderGaps; });
    $("exportData").onclick = () => {
      const backup = { items, looks, planner, shopping, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = "closet-curator-cloud-backup.json";
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    };
    $("importData").onchange = () =>
      alert("Cloud imports require validation and are disabled. Your previous local backup remains unchanged.");
    window.toggleFav = toggleFav;
    window.removeItem = removeItem;
    window.editItem = editItem;
    window.deleteLook = deleteLook;
    window.assignDay = assignDay;
    window.editShopping = editShopping;
    window.toggleShoppingPurchased = toggleShoppingPurchased;
    window.removeShopping = removeShopping;
  }

  async function handleSession(session) {
    user = session?.user || null;
    $("authScreen").classList.toggle("hidden", Boolean(user));
    $("accountEmail").textContent = user ? `Signed in as ${user.email}` : "Not signed in";
    if (user) {
      subscribe();
      await loadCloudData();
      surprise();
    } else {
      items = []; looks = []; planner = {}; shopping = []; current = {};
      renderAll();
      status("Sign in, or create an account if this is your first visit.");
      syncStatus(configured ? "Sign in required" : "Setup required");
    }
  }

  async function start() {
    wireInterface();
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
    }
    if (!configured) {
      renderAll();
      requireClient();
      syncStatus("Setup required");
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
    const { data } = await client.auth.getSession();
    await handleSession(data.session);
  }

  start().catch((error) => {
    status(`App startup failed: ${error.message}`, true);
    syncStatus("Startup error");
  });
})();
