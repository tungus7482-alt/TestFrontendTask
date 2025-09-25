let products = [];
let filteredProducts = [];
let currentPage = 1;
const perPage = 12;
let debounceTimer;
let compareList = JSON.parse(localStorage.getItem("compareList")) || [];

document.addEventListener("DOMContentLoaded", loadProducts);

function showLoader() {
  document.getElementById("loader").style.display = "flex";
  document.getElementById("catalog").style.display = "none";
  document.getElementById("pagination").style.display = "none";
}

function hideLoader() {
  document.getElementById("loader").style.display = "none";
  document.getElementById("catalog").style.display = "grid";
  document.getElementById("pagination").style.display = "flex";
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(header => header.trim());
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const cleanValues = values.map(value => 
      value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
    );
    
    if (cleanValues.length === headers.length) {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = cleanValues[index];
      });
      result.push(obj);
    }
  }
  
  return result;
}

async function loadProducts() {
  try {
    showLoader();

    let res = await fetch("api/data/products.json?" + Date.now());
    
    if (res.ok) {

      products = await res.json();
    } else if (res.status === 404) {

      console.log("JSON файл не найден, пробуем загрузить CSV...");
      res = await fetch("api/data/products.csv?" + Date.now());
      
      if (res.ok) {
        const csvText = await res.text();
        const csvData = parseCSV(csvText);
      
      products = csvData.map(item => ({
        id: parseInt(item.id) || 0,
        name: item.name || '',
        category: item.category || '',
        price: parseFloat(item.price) || 0,
        stock: parseInt(item.stock) || 0,
        rating: parseFloat(item.rating) || 0,
        reviews_count: parseInt(item.reviews_count) || 0,
        created_at: item.created_at || '',
        image: item.image || '',
        promo: item.promo || null,
        description: item.description || null
      }));
      }else if (res.status === 404) {
        console.log("CSV файл также не найден, используем пустой каталог");
        products = [];
      } else {
        throw new Error(`Ошибка загрузки CSV: ${res.status} ${res.statusText}`);
      }
    } else {
      throw new Error(`Ошибка загрузки JSON: ${res.status} ${res.statusText}`);
    }

    fillCategoryFilter();
    restoreFromURL();
    applyFilters();
    renderCompareTable();

    hideLoader();
  } catch (err) {
    if (!err.message.includes('404') && !err.message.includes('Не найден')) {
      document.getElementById("loader").innerText = "Ошибка загрузки товаров!";
      console.error("Ошибка при загрузке:", err);
    } else {
      products = [];
      console.log("Файлы товаров не найдены, используется пустой каталог");
    }

    fillCategoryFilter();
    restoreFromURL();
    applyFilters();
    renderCompareTable();
    hideLoader();
  }

  document.getElementById("search").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentPage = 1;
      applyFilters();
    }, 300);
  });

  ["category", "minPrice", "maxPrice", "inStock", "sort"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      currentPage = 1;
      applyFilters();
    });
  });
}

function fillCategoryFilter() {
  const categorySelect = document.getElementById("category");
  const categories = [...new Set(products.map(p => p.category))];
  categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
}

function updateURL() {
  const params = new URLSearchParams();

  const search = document.getElementById("search").value;
  const category = document.getElementById("category").value;
  const minPrice = document.getElementById("minPrice").value;
  const maxPrice = document.getElementById("maxPrice").value;
  const inStock = document.getElementById("inStock").checked;
  const sort = document.getElementById("sort").value;

  if (search) params.set("q", search);
  if (category) params.set("cat", category);
  if (minPrice) params.set("min", minPrice);
  if (maxPrice) params.set("max", maxPrice);
  if (inStock) params.set("inStock", "1");
  if (sort) params.set("sort", sort);
  if (currentPage > 1) params.set("page", currentPage);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function restoreFromURL() {
  const params = new URLSearchParams(window.location.search);

  document.getElementById("search").value = params.get("q") || "";
  document.getElementById("category").value = params.get("cat") || "";
  document.getElementById("minPrice").value = params.get("min") || "";
  document.getElementById("maxPrice").value = params.get("max") || "";
  document.getElementById("inStock").checked = params.get("inStock") === "1";
  document.getElementById("sort").value = params.get("sort") || "";
  currentPage = parseInt(params.get("page")) || 1;
}

function applyFilters() {
  const search = document.getElementById("search").value.toLowerCase();
  const category = document.getElementById("category").value;
  const minPrice = parseFloat(document.getElementById("minPrice").value) || 0;
  const maxPrice = parseFloat(document.getElementById("maxPrice").value) || Infinity;
  const inStock = document.getElementById("inStock").checked;
  const sort = document.getElementById("sort").value;

  filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search) &&
    (category === "" || p.category === category) &&
    p.price >= minPrice &&
    p.price <= maxPrice &&
    (!inStock || p.stock > 0)
  );

  switch (sort) {
    case "price_asc":
      filteredProducts.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      filteredProducts.sort((a, b) => b.price - a.price);
      break;
    case "rating_desc":
      filteredProducts.sort((a, b) => b.rating - a.rating);
      break;
    case "date_desc":
      filteredProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
  }

  updateURL();
  renderProducts();
  renderPagination();
}

function getBadges(product, categoryMedian) {
  const badges = [];
  const createdDate = new Date(product.created_at);
  const daysDiff = (Date.now() - createdDate) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 30) badges.push({ text: "Новинка", type: "new" });

  if (product.rating >= 4.7 && product.reviews_count >= 50) {
    badges.push({ text: "Топ-рейтинг", type: "top" });
  }

  if (categoryMedian && product.price <= categoryMedian * 0.85) {
    badges.push({ text: "Выгодно", type: "deal" });
  }

  if (product.stock == 3) {
    badges.push({ text: "Последний!", type: "last" });
  }

  if (product.stock == 0) {
    badges.push({ text: "нет в наличии", type: "last" });
  }

  return badges.slice(0, 2);
}

function renderProducts() {
  const catalog = document.getElementById("catalog");
  catalog.innerHTML = "";

  const start = (currentPage - 1) * perPage;
  const end = start + perPage;
  const pageProducts = filteredProducts.slice(start, end);

  const medians = {};
  const grouped = {};
  products.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p.price);
  });
  for (const cat in grouped) {
    const arr = grouped[cat].sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    medians[cat] =
      arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  }

  pageProducts.forEach(p => {
    const card = document.createElement("div");
    card.className = "product-card";

    const badges = getBadges(p, medians[p.category])
      .map(b => `<span class="badge badge--${b.type}">${b.text}</span>`)
      .join("");

    const isInCompare = compareList.includes(p.id);
    
    card.innerHTML = `
      <div class="product-card__badges">${badges}</div>
      <img src="${p.image}" alt="${p.name}" class="product-card__image">
      <h3 class="product-card__title">${p.name}</h3>
      <p class="product-card__price">${p.price} ₽</p>
      <p class="product-card__rating">⭐ ${p.rating} (${p.reviews_count})</p>
      <p class="product-card__stock">${p.stock > 0 ? "В наличии" : "Нет в наличии"}</p>
      <label class="compare-label">
        <input type="checkbox" class="compare-checkbox" data-id="${p.id}" ${isInCompare ? 'checked' : ''}>
        Сравнить
      </label>
    `;
    catalog.appendChild(card);
  });

  document.querySelectorAll('.compare-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      toggleCompare(parseInt(this.dataset.id));
    });
  });
}

function renderPagination() {
  const pagination = document.getElementById("pagination");
  pagination.innerHTML = "";

  const totalProducts = filteredProducts.length;
  const totalPages = Math.ceil(totalProducts / perPage);
  
  if (totalPages <= 1) return;

  const startItem = (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, totalProducts);
  
  const infoSpan = document.createElement("span");
  infoSpan.className = "pagination-info";
  infoSpan.textContent = `Показано ${startItem}-${endItem} из ${totalProducts}`;
  pagination.appendChild(infoSpan);

  const prevBtn = document.createElement("button");
  prevBtn.innerHTML = '‹';
  prevBtn.className = "pagination-btn";
  if (currentPage === 1) prevBtn.classList.add("disabled");
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      applyFilters();
    }
  });
  pagination.appendChild(prevBtn);

  if (currentPage > 2) {
    const firstBtn = document.createElement("button");
    firstBtn.textContent = "1";
    firstBtn.className = "pagination-btn";
    firstBtn.addEventListener("click", () => {
      currentPage = 1;
      applyFilters();
    });
    pagination.appendChild(firstBtn);
  }

  if (currentPage > 3) {
    const dots = document.createElement("span");
    dots.textContent = "...";
    dots.className = "pagination-dots";
    pagination.appendChild(dots);
  }

  for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "pagination-btn";
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentPage = i;
      applyFilters();
    });
    pagination.appendChild(btn);
  }

  if (currentPage < totalPages - 2) {
    const dots = document.createElement("span");
    dots.textContent = "...";
    dots.className = "pagination-dots";
    pagination.appendChild(dots);
  }

  if (currentPage < totalPages - 1) {
    const lastBtn = document.createElement("button");
    lastBtn.textContent = totalPages;
    lastBtn.className = "pagination-btn";
    lastBtn.addEventListener("click", () => {
      currentPage = totalPages;
      applyFilters();
    });
    pagination.appendChild(lastBtn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.innerHTML = '›';
  nextBtn.className = "pagination-btn";
  if (currentPage === totalPages) nextBtn.classList.add("disabled");
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      applyFilters();
    }
  });
  pagination.appendChild(nextBtn);
}

function toggleCompare(productId) {
  if (compareList.includes(productId)) {
    compareList = compareList.filter(id => id !== productId);
  } else {
    if (compareList.length >= 4) {
      alert('Можно сравнить не более 4 товаров одновременно!');
      return;
    }
    compareList.push(productId);
  }
  
  localStorage.setItem("compareList", JSON.stringify(compareList));
  
  renderCompareTable();
  
  renderProducts();
}

function renderCompareTable() {
  const compareContainer = document.getElementById('compare-container');
  const compareTable = document.getElementById('compare-table');
  
  if (compareList.length === 0) {
    compareContainer.style.display = 'none';
    return;
  }
  
  compareContainer.style.display = 'block';
  
  const compareProducts = products.filter(p => compareList.includes(p.id));
  
  compareTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Наименование</th>
          ${compareProducts.map(p => `<th>${p.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Цена</td>
          ${compareProducts.map(p => `<td>${p.price} ₽</td>`).join('')}
        </tr>
        <tr>
          <td>Рейтинг</td>
          ${compareProducts.map(p => `<td>⭐ ${p.rating}</td>`).join('')}
        </tr>
        <tr>
          <td>Наличие</td>
          ${compareProducts.map(p => `<td>${p.stock > 0 ? 'В наличии' : 'Нет в наличии'}</td>`).join('')}
        </tr>
        <tr>
          <td>Категория</td>
          ${compareProducts.map(p => `<td>${p.category}</td>`).join('')}
        </tr>
      </tbody>
    </table>
    <button id="clear-compare" class="clear-compare-btn">Очистить сравнение</button>
  `;
  
  document.getElementById('clear-compare').addEventListener('click', clearCompare);
}

function clearCompare() {
  compareList = [];
  localStorage.removeItem("compareList");
  renderCompareTable();
  renderProducts();
}