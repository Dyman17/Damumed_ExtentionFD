const PARSE_DICTATION_PROMPT = `
Ты медицинский секретарь.
Контекст пациента: {scrapedContext}

Верни валидный JSON с полями:
- complaints
- anamnesis
- objective
- plan
- procedures
- recommendations

Правила:
1) Только медицинская терминология.
2) Не выдумывай данные.
3) Если поля нет — null.
4) Только JSON.
`;
