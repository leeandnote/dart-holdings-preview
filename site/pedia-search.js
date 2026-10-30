const input = document.querySelector('#pedia-search');
if (input) {
  const cards = [...document.querySelectorAll('.pediaCompany')];
  const status = document.querySelector('#pedia-search-status');
  const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/g, '');
  input.addEventListener('input', () => {
    const query = normalize(input.value);
    let count = 0;
    for (const card of cards) {
      const matches = normalize(card.querySelector('strong').textContent + card.querySelector('small').textContent).includes(query);
      card.hidden = !matches;
      if (matches) count++;
    }
    status.textContent = count ? `${count}개 수록 종목` : '수록된 종목이 없습니다. 종목명 또는 6자리 코드를 확인해 주세요.';
  });
}
