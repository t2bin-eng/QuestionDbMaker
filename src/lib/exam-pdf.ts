export interface ExamPdfQuestion {
  canvas: HTMLCanvasElement;
  score: number;
}

export interface ExamPdfOptions {
  title: string;
  school: string;
  subject: string;
  grade: string;
  examName: string;
  examDate: string;
  questionsPerPage: 4 | 6;
  showStudentFields: boolean;
  showScores: boolean;
  questions: ExamPdfQuestion[];
}

export interface PdfQuestionSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PAGE_WIDTH = 1654;
const PAGE_HEIGHT = 2339;
const PAGE_MARGIN_X = 92;
const HEADER_HEIGHT = 318;
const FOOTER_HEIGHT = 72;
const COLUMN_GAP = 44;
const ROW_GAP = 34;

export function calculateQuestionSlots(questionsPerPage: 4 | 6): PdfQuestionSlot[] {
  const rowCount = questionsPerPage / 2;
  const contentTop = HEADER_HEIGHT;
  const contentHeight = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;
  const columnWidth = (PAGE_WIDTH - PAGE_MARGIN_X * 2 - COLUMN_GAP) / 2;
  const rowHeight = (contentHeight - ROW_GAP * (rowCount - 1)) / rowCount;
  return Array.from({ length: questionsPerPage }, (_, index) => {
    // Korean exam papers flow vertically within the left column first,
    // then continue at the top of the right column.
    const column = Math.floor(index / rowCount);
    const row = index % rowCount;
    return {
      x: PAGE_MARGIN_X + column * (columnWidth + COLUMN_GAP),
      y: contentTop + row * (rowHeight + ROW_GAP),
      width: columnWidth,
      height: rowHeight,
    };
  });
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  font: string,
  color = "#18201d",
) {
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, PAGE_WIDTH / 2, y);
  context.restore();
}

function drawHeader(context: CanvasRenderingContext2D, options: ExamPdfOptions) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  context.fillStyle = "#1f6b4f";
  context.fillRect(PAGE_WIDTH / 2 - 42, 54, 84, 7);
  drawCenteredText(
    context,
    options.title || "문제지",
    112,
    '700 52px "Malgun Gothic", "Noto Sans KR", sans-serif',
  );
  const meta = [options.school, options.grade, options.subject, options.examName, options.examDate]
    .filter(Boolean)
    .join("  ·  ");
  drawCenteredText(
    context,
    meta,
    170,
    '500 22px "Malgun Gothic", "Noto Sans KR", sans-serif',
    "#5e6a64",
  );

  if (options.showStudentFields) {
    const boxX = PAGE_WIDTH / 2 - 470;
    const boxY = 204;
    const boxWidth = 940;
    const boxHeight = 66;
    context.save();
    context.fillStyle = "#f7faf8";
    context.strokeStyle = "#ccd7d0";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(boxX, boxY, boxWidth, boxHeight, 13);
    context.fill();
    context.stroke();

    const fields = [
      { label: "학년", width: 180 },
      { label: "반", width: 150 },
      { label: "번호", width: 180 },
      { label: "이름", width: 430 },
    ];
    let left = boxX;
    fields.forEach((field, index) => {
      if (index > 0) {
        context.beginPath();
        context.moveTo(left, boxY + 13);
        context.lineTo(left, boxY + boxHeight - 13);
        context.stroke();
      }
      context.fillStyle = "#3c4942";
      context.font = '600 19px "Malgun Gothic", "Noto Sans KR", sans-serif';
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(field.label, left + 22, boxY + boxHeight / 2);
      context.strokeStyle = "#8d9a93";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(left + 72, boxY + 43);
      context.lineTo(left + field.width - 20, boxY + 43);
      context.stroke();
      left += field.width;
    });
    context.restore();
  }

  context.strokeStyle = "#1f6b4f";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(PAGE_MARGIN_X, 294);
  context.lineTo(PAGE_WIDTH - PAGE_MARGIN_X, 294);
  context.stroke();
}

function drawQuestion(
  context: CanvasRenderingContext2D,
  question: ExamPdfQuestion,
  slot: PdfQuestionSlot,
  showScores: boolean,
) {
  const innerPadding = 14;
  const scoreHeight = showScores ? 34 : 6;
  const availableWidth = slot.width - innerPadding * 2;
  const availableHeight = slot.height - innerPadding * 2 - scoreHeight;
  const scale = Math.min(
    availableWidth / question.canvas.width,
    availableHeight / question.canvas.height,
    1,
  );
  const drawWidth = question.canvas.width * scale;
  const drawHeight = question.canvas.height * scale;
  const drawX = slot.x + innerPadding;
  const drawY = slot.y + scoreHeight + innerPadding;

  if (showScores) {
    context.fillStyle = "#4c5751";
    context.font = '600 19px "Malgun Gothic", "Noto Sans KR", sans-serif';
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillText(`[${question.score}점]`, slot.x + slot.width - 8, slot.y + 17);
  }
  context.drawImage(question.canvas, drawX, drawY, drawWidth, drawHeight);
}

function drawGrid(context: CanvasRenderingContext2D, slots: PdfQuestionSlot[], questionsPerPage: 4 | 6) {
  const rowCount = questionsPerPage / 2;
  context.save();
  context.strokeStyle = "#e2e8e4";
  context.lineWidth = 1.5;
  const centerX = PAGE_WIDTH / 2;
  context.beginPath();
  context.moveTo(centerX, HEADER_HEIGHT + 8);
  context.lineTo(centerX, PAGE_HEIGHT - FOOTER_HEIGHT - 8);
  context.stroke();
  for (let row = 1; row < rowCount; row += 1) {
    const upperSlot = slots[(row - 1) * 2];
    const lowerSlot = slots[row * 2];
    const y = (upperSlot.y + upperSlot.height + lowerSlot.y) / 2;
    context.beginPath();
    context.moveTo(PAGE_MARGIN_X, y);
    context.lineTo(PAGE_WIDTH - PAGE_MARGIN_X, y);
    context.stroke();
  }
  context.restore();
}

export async function createExamPdf(options: ExamPdfOptions) {
  if (!options.questions.length) throw new Error("PDF에 넣을 문항이 없습니다.");
  const { jsPDF } = await import("jspdf");
  const slots = calculateQuestionSlots(options.questionsPerPage);
  const pageCount = Math.ceil(options.questions.length / options.questionsPerPage);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [PAGE_WIDTH, PAGE_HEIGHT],
    compress: true,
    hotfixes: ["px_scaling"],
  });

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], "portrait");
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = PAGE_WIDTH;
    pageCanvas.height = PAGE_HEIGHT;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("PDF 페이지 캔버스를 만들지 못했습니다.");
    drawHeader(context, options);
    drawGrid(context, slots, options.questionsPerPage);

    const pageQuestions = options.questions.slice(
      pageIndex * options.questionsPerPage,
      (pageIndex + 1) * options.questionsPerPage,
    );
    pageQuestions.forEach((question, index) => {
      drawQuestion(context, question, slots[index], options.showScores);
    });

    drawCenteredText(
      context,
      `- ${pageIndex + 1} -`,
      PAGE_HEIGHT - 34,
      '500 18px "Malgun Gothic", "Noto Sans KR", sans-serif',
      "#7a8580",
    );
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");
  }

  return new Uint8Array(pdf.output("arraybuffer"));
}
