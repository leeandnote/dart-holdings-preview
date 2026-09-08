(function () {
  const DETAIL_TITLE = "가격·지분변동 차트";
  const FALLBACK_CLASS = "detail-chart-fallback";

  function cleanName(text) {
    return (text || "").replace(/\s*가격·지분변동 차트\s*/g, "").trim();
  }

  function chartLooksReal(card) {
    const charts = Array.from(card.querySelectorAll("canvas,svg"));
    return charts.some((el) => {
      if (el.closest("." + FALLBACK_CLASS)) return false;
      const box = el.getBoundingClientRect();
      if (box.width < 240 || box.height < 120) return false;
      if (el.tagName.toLowerCase() === "svg") {
        return el.querySelectorAll("path,polyline,line,rect,circle").length > 8;
      }
      return true;
    });
  }

  function findDetailCards() {
    return Array.from(document.querySelectorAll("section,article,.card,.panel,div")).filter((el) => {
      const title = el.querySelector("h1,h2,h3,h4,.section-title,.card-title");
      return title && title.textContent.includes(DETAIL_TITLE);
    });
  }

  function findStockRow(stockName) {
    if (!stockName) return null;
    const rows = Array.from(document.querySelectorAll("tbody tr,.table-row,.holding-row,.data-row"));
    return rows.find((row) => {
      if (!row.textContent.includes(stockName)) return false;
      const spark = row.querySelector("svg,canvas");
      if (!spark) return false;
      const box = spark.getBoundingClientRect();
      return box.width > 40 && box.height > 20;
    });
  }

  function cloneSparkline(row) {
    if (!row) return null;
    const spark = row.querySelector("svg");
    if (!spark) return null;
    const clone = spark.cloneNode(true);
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    clone.setAttribute("preserveAspectRatio", "none");
    clone.style.width = "100%";
    clone.style.height = "220px";
    clone.style.display = "block";
    return clone;
  }

  function makeFallback(stockName) {
    const row = findStockRow(stockName);
    const line = cloneSparkline(row);
    const wrap = document.createElement("div");
    wrap.className = FALLBACK_CLASS;

    if (line) {
      wrap.innerHTML = '<div class="detail-chart-fallback-head"><strong>' +
        (stockName || "선택 종목") +
        '</strong><span>가격 캐시가 비어 있어 메인 표의 1년 추이를 확대 표시합니다.</span></div>';
      wrap.appendChild(line);
      return wrap;
    }

    wrap.innerHTML = '<div class="detail-chart-fallback-empty"><strong>' +
      (stockName || "선택 종목") +
      ' 가격 데이터 없음</strong><span>해당 종목의 가격 캐시가 아직 없어 차트를 표시하지 못했습니다. 데이터갱신 후 다시 확인해주세요.</span></div>';
    return wrap;
  }

  function hideBlankChildren(card, title) {
    Array.from(card.children).forEach((child) => {
      if (child === title || child.classList.contains(FALLBACK_CLASS)) return;
      if (child.querySelector && child.querySelector("canvas,svg") && chartLooksReal(child)) return;
      const text = (child.textContent || "").trim();
      const box = child.getBoundingClientRect();
      if (text.includes("가격 캐시 로딩 중") || (!text && box.height > 120)) {
        child.style.display = "none";
      }
    });
  }

  function patchCard(card) {
    if (chartLooksReal(card)) return;
    const title = card.querySelector("h1,h2,h3,h4,.section-title,.card-title");
    const stockName = cleanName(title ? title.textContent : "");
    card.querySelectorAll("." + FALLBACK_CLASS).forEach((el) => el.remove());
    hideBlankChildren(card, title);
    card.appendChild(makeFallback(stockName));
  }

  function run() {
    findDetailCards().forEach(patchCard);
  }

  function debounce(fn, wait) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  const scheduled = debounce(run, 120);
  window.addEventListener("load", run);
  window.addEventListener("hashchange", scheduled);
  window.addEventListener("popstate", scheduled);
  document.addEventListener("click", () => setTimeout(run, 250), true);
  new MutationObserver(scheduled).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(run, 1500);
})();