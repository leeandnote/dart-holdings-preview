import { parseHTML } from 'linkedom';

export function polishIssueHtml(html) {
  const { document } = parseHTML(html);
  const table = document.querySelector('.issueTable');
  if (table && !table.querySelector('tbody tr')) {
    document.querySelector('.issueTableTitle')?.remove();
    table.closest('.issueTableWrap')?.remove();
    const note = document.querySelector('.articleBody > .note');
    if (note) note.textContent = '일반 공시 해설입니다. 개별 기업의 조건은 최신 정정을 포함한 공식 공시에서 확인하세요.';
  }
  document.querySelector('#issue-faq-schema')?.remove();
  const questions = [...document.querySelectorAll('.issueFaq h3')].flatMap(h => {
    const answer = h.nextElementSibling;
    return answer?.tagName === 'P' ? [{'@type':'Question', name:h.textContent, acceptedAnswer:{'@type':'Answer', text:answer.textContent}}] : [];
  });
  if (questions.length) {
    const script = document.createElement('script');
    script.id = 'issue-faq-schema'; script.type = 'application/ld+json';
    script.textContent = JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',mainEntity:questions}).replaceAll('<','\\u003c');
    document.head.append(script);
  }
  return document.toString();
}
