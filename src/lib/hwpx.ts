import { strToU8, zipSync, type Zippable } from "fflate";

export interface HwpxQuestionImage {
  data: Uint8Array;
  width: number;
  height: number;
  label: string;
  score: number;
}

export interface HwpxDocumentOptions {
  title: string;
  school: string;
  subject: string;
  grade?: string;
  examName?: string;
  examDate?: string;
  columns?: 1 | 2;
  questionsPerPage?: 4 | 6;
  showStudentFields?: boolean;
  showScores?: boolean;
  headerXml: string;
  questions: HwpxQuestionImage[];
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const NAMESPACES = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
].join(" ");

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textParagraph(
  text: string,
  id: number,
  charPrIDRef = 0,
  paraPrIDRef = 0,
) {
  return `<hp:p id="${id}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`;
}

function columnStartParagraph(id: number, columns: 1 | 2) {
  const gap = columns === 2 ? 1134 : 0;
  return `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="${columns}" sameSz="1" sameGap="${gap}"/></hp:ctrl></hp:run></hp:p>`;
}

function pictureParagraph(
  question: HwpxQuestionImage,
  index: number,
  id: number,
  columns: 1 | 2,
  questionsPerPage: 4 | 6,
) {
  const maxWidth = columns === 2 ? 22_500 : 46_000;
  const maxHeight = columns === 2
    ? questionsPerPage === 6 ? 16_500 : 25_000
    : questionsPerPage === 6 ? 10_500 : 16_000;
  const sourceRatio = question.width / question.height;
  let width = maxWidth;
  let height = Math.round(width / sourceRatio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * sourceRatio);
  }

  const sourceWidth = Math.max(1, question.width * 4);
  const sourceHeight = Math.max(1, question.height * 4);
  const pictureId = 1_000_000 + index;
  const imageId = `image${index + 1}`;

  return `<hp:p id="${id}" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:pic id="${pictureId}" zOrder="${index}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${pictureId}" reverse="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:offset x="0" y="0"/><hp:orgSz width="${width}" height="${height}"/><hp:curSz width="${width}" height="${height}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(width / 2)}" centerY="${Math.round(height / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:lineShape color="none" width="0" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${width}" y="0"/><hc:pt2 x="${width}" y="${height}"/><hc:pt3 x="0" y="${height}"/></hp:imgRect><hp:imgClip left="0" right="${sourceWidth}" top="0" bottom="${sourceHeight}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${sourceWidth}" dimheight="${sourceHeight}"/><hc:img binaryItemIDRef="${imageId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic></hp:run></hp:p>`;
}

function createSectionXml(options: HwpxDocumentOptions) {
  const columns = options.columns ?? 2;
  const questionsPerPage = options.questionsPerPage ?? 4;
  const sectionProperties = `<hp:p id="100" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="5669" right="5669" top="5668" bottom="4252"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run></hp:p>`;
  const info = [
    options.school,
    options.grade,
    options.subject,
    options.examName,
    options.examDate,
  ].filter(Boolean).join("  |  ");
  const studentFields = options.showStudentFields === false
    ? ""
    : "학년 ______   반 ______   번호 ______   이름 ____________________";
  const body = options.questions.map((question, index) => [
    // 배점은 PNG 안에 합성되어 문항과 다른 단/쪽으로 분리되지 않습니다.
    pictureParagraph(question, index, 1_001 + index * 2, columns, questionsPerPage),
    textParagraph("", 1_002 + index * 2, 18),
  ].join("")).join("");

  return `${XML_DECLARATION}<hs:sec ${NAMESPACES}>${sectionProperties}${textParagraph(options.title, 200, 24, 20)}${textParagraph(info, 201, 0, 20)}${studentFields ? textParagraph(studentFields, 202, 1, 28) : ""}${textParagraph("────────────────────────────────────────", 203, 18, 20)}${columnStartParagraph(204, columns)}${body}</hs:sec>`;
}

function createContentHpf(options: HwpxDocumentOptions) {
  const images = options.questions.map((_, index) =>
    `<opf:item id="image${index + 1}" href="BinData/image${index + 1}.png" media-type="image/png" isEmbeded="1"/>`,
  ).join("");
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${XML_DECLARATION}<opf:package ${NAMESPACES} version="" unique-identifier="" id=""><opf:metadata><opf:title>${escapeXml(options.title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">Question Card Studio</opf:meta><opf:meta name="subject" content="text">${escapeXml(options.subject)}</opf:meta><opf:meta name="description" content="text">문항 카드로 생성한 문제지</opf:meta><opf:meta name="lastsaveby" content="text">Question Card Studio</opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta><opf:meta name="keyword" content="text"/></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>${images}</opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
}

export function createHwpxPackage(options: HwpxDocumentOptions) {
  if (!options.questions.length) throw new Error("HWPX에 넣을 문항이 없습니다.");

  const files: Zippable = {
    mimetype: [strToU8("application/hwp+zip"), { level: 0 }],
    "version.xml": strToU8(`${XML_DECLARATION}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.2" application="Question Card Studio" appVersion="1.0"/>`),
    "Contents/header.xml": strToU8(options.headerXml),
    "Contents/section0.xml": strToU8(createSectionXml(options)),
    "Contents/content.hpf": strToU8(createContentHpf(options)),
    "settings.xml": strToU8(`${XML_DECLARATION}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`),
    "Preview/PrvText.txt": strToU8([options.title, options.school, options.grade, options.subject, options.examName, options.examDate, ...options.questions.map((question) => question.label)].filter(Boolean).join("\n")),
    "META-INF/container.xml": strToU8(`${XML_DECLARATION}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`),
    "META-INF/container.rdf": strToU8(`${XML_DECLARATION}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`),
    "META-INF/manifest.xml": strToU8(`${XML_DECLARATION}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`),
  };

  options.questions.forEach((question, index) => {
    files[`BinData/image${index + 1}.png`] = question.data;
  });

  return zipSync(files, { level: 6 });
}
