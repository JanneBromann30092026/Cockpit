/**
 * A tiny one-page PDF (Helvetica, A4) for invented demo contracts – enough to try the
 * viewer and the encrypted file storage without a real document.
 */

const WIN_ANSI: Record<string, string> = {
  ä: '\\344',
  ö: '\\366',
  ü: '\\374',
  Ä: '\\304',
  Ö: '\\326',
  Ü: '\\334',
  ß: '\\337',
  '€': '\\200',
  '–': '\\226',
  '„': '\\204',
  '“': '\\223',
};

function pdfText(text: string): string {
  return [...text]
    .map((char) => {
      if (char === '(' || char === ')' || char === '\\') return `\\${char}`;
      if (WIN_ANSI[char]) return WIN_ANSI[char];
      return char.charCodeAt(0) < 128 ? char : '?';
    })
    .join('');
}

export function demoPdf(title: string, lines: readonly string[]): Uint8Array<ArrayBuffer> {
  const content = [
    'BT',
    '/F1 20 Tf',
    '56 770 Td',
    `(${pdfText(title)}) Tj`,
    '/F1 12 Tf',
    '0 -36 Td',
    ...lines.flatMap((line) => [`(${pdfText(line)}) Tj`, '0 -20 Td']),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Only ASCII characters remain (umlauts are octal escapes), so length = bytes.
  return new TextEncoder().encode(body);
}
