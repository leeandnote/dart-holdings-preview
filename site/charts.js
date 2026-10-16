import {chartGroups, chartUrl, widgetOptions} from './charts-data.mjs?v=20261016-1';

const panel = document.querySelector('#chartPanel');
const buttons = [...document.querySelectorAll('[data-group]')];
const compact = window.matchMedia('(max-width:700px)');
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function link(symbol, text) {
  const a = element('a', '', text);
  a.href = chartUrl(symbol);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
function render(group) {
  if (!Object.hasOwn(chartGroups, group)) group = 'global';
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === group)));
  panel.replaceChildren();
  panel.className = group === 'domestic' ? 'chartLinks' : 'chartGrid';
  for (const item of chartGroups[group]) {
    const external = group === 'domestic' || item.external;
    const article = element('article', external ? 'chartLink' : 'marketChart');
    const heading = element('div', external ? '' : 'chartHeading');
    heading.append(element('h2', '', item.name), element(external ? 'p' : 'span', '', item.type));
    article.append(heading);
    if (external) {
      article.append(link(item.symbol, '원본 차트 ↗'));
    } else {
      const frame = element('div', 'chartEmbed');
      const container = element('div', 'tradingview-widget-container');
      container.append(element('div', 'tradingview-widget-container__widget'));
      const credit = element('div', 'tradingview-widget-copyright');
      credit.append(link(item.symbol, `${item.name} chart by TradingView`));
      const script = document.createElement('script');
      script.src = compact.matches
        ? 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js'
        : 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.textContent = JSON.stringify(compact.matches ? {
        symbols:[[item.name, `${item.symbol}|1D`]], autosize:true, colorTheme:'light', locale:'kr',
        chartType:'area', showVolume:false, hideDateRanges:false, hideMarketStatus:false,
        dateRanges:['3m|60','1d|1','1m|30','12m|1D','all|1M'], scalePosition:'right',
        fontSize:'12', headerFontSize:'medium', chartOnly:false,
      } : widgetOptions(item.symbol));
      script.onerror = () => {
        frame.replaceChildren(element('p', 'chartError', '외부 차트를 불러오지 못했다. 아래 원본 차트에서 확인할 수 있다.'));
      };
      container.append(credit, script);
      frame.append(container);
      const foot = element('div', 'chartFoot');
      foot.append(element('span', '', `${item.source} · 공급자 시세 기준`), link(item.symbol, '원본 차트 ↗'));
      article.append(frame, foot);
    }
    panel.append(article);
  }
}
buttons.forEach(button => button.addEventListener('click', () => {
  history.replaceState(null, '', `#${button.dataset.group}`);
  render(button.dataset.group);
}));
window.addEventListener('hashchange', () => render(location.hash.slice(1)));
compact.addEventListener('change', () => render(location.hash.slice(1)));
render(location.hash.slice(1));
