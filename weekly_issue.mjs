import {readFile} from 'node:fs/promises';
export async function loadWeeklyIssue(week) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week||'')) throw Error('Expected reviewed Monday YYYY-MM-DD');
  const start=new Date(`${week}T00:00:00Z`);
  if(start.getUTCDay()!==1) throw Error('Issue must start on Monday');
  const issue=JSON.parse(await readFile(new URL(`./weekly-issues/${week}.json`,import.meta.url),'utf8'));
  const end=new Date(+start+6*86400000).toISOString().slice(0,10);
  if(issue.week!==week||!issue.reviewedAt||issue.highlights?.length!==3||!issue.events?.length) throw Error('Issue not reviewed');
  for(const e of issue.events) if(e.date<week||e.date>end||!e.title||!e.detail||!['us','jp','kr','cn'].includes(e.country)||!issue.sources[e.source]?.startsWith('https://')) throw Error('Invalid sourced event');
  const md=s=>s.slice(5).split('-').map(Number).join('/');
  const heading=`[리앤노트] 다음 주 증시 일정 | ${md(week)}~${md(end)}`;
  const caption=`${heading}\n\n${issue.highlights.join('\n')}\n\n공식 출처로 확인한 주요 일정을 한 장에 정리했습니다. 시간은 KST, 해외 행사는 현지 날짜 기준입니다. 일정은 변경될 수 있습니다.\n\nhttps://leeandnote.com/calendar\n\n#리앤노트 #주간증시일정 #증시캘린더`;
  return {...issue,end,caption,shortCaption:`${heading}\n${issue.highlights.join('\n')}\n시간 KST / 해외 행사 현지 날짜 / 일정 변경 가능\n#리앤노트 #주간증시일정`};
}
