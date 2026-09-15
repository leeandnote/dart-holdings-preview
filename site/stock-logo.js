(function stockLogoComponent(global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function initial(name) {
    const normalized = String(name || "")
      .replace(/^\s*(?:\(주\)|㈜|주식회사)\s*/u, "")
      .trim();
    return Array.from(normalized)[0] || "?";
  }

  function render({ stockCode, stockName, src } = {}) {
    const code = String(stockCode || "").replace(/\D/g, "").slice(0, 6);
    const logoSrc = src || (code.length === 6 ? `/logos/${code}.svg` : "");
    const label = `${stockName || code || "종목"} 로고`;
    return `<span class="stockLogoComponent" role="img" aria-label="${escapeHtml(label)}">
      <span class="stockLogoFallback" aria-hidden="true">${escapeHtml(initial(stockName))}</span>
      ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="" loading="lazy" onload="window.StockLogo.handleLoad(this)" onerror="window.StockLogo.handleError(this)">` : ""}
    </span>`;
  }

  function handleLoad(image) {
    image.closest(".stockLogoComponent")?.classList.add("hasLogo");
  }

  function handleError(image) {
    image.remove();
  }

  global.StockLogo = { render, handleLoad, handleError };
})(window);
