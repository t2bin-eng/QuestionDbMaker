import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createHwpxPackage } from "./hwpx";

describe("createHwpxPackage", () => {
  it("creates a HWPX ZIP with linked question images", () => {
    const packageBytes = createHwpxPackage({
      title: "한국사 문제지",
      school: "샘플고",
      subject: "한국사",
      headerXml: '<?xml version="1.0"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"/>',
      questions: [
        {
          data: new Uint8Array([137, 80, 78, 71]),
          width: 1200,
          height: 800,
          label: "원본 3번",
          score: 2,
        },
      ],
    });

    const files = unzipSync(packageBytes);
    expect(strFromU8(files.mimetype)).toBe("application/hwp+zip");
    expect(files["Contents/header.xml"]).toBeDefined();
    expect(files["Contents/section0.xml"]).toBeDefined();
    expect(files["Contents/content.hpf"]).toBeDefined();
    expect(files["BinData/image1.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));

    const section = strFromU8(files["Contents/section0.xml"]);
    expect(section).toContain("한국사 문제지");
    expect(section).toContain("샘플고");
    expect(section).toContain('colCount="2"');
    expect(section).toContain('sameGap="1134"');
    expect(section).toContain('width="22500"');
    expect(section).not.toContain('pageBreak="1"');
    expect(section).not.toContain("원본 3번");
    expect(section).not.toContain("[2점]");
    expect(section).toContain('binaryItemIDRef="image1"');

    const manifest = strFromU8(files["Contents/content.hpf"]);
    expect(manifest).toContain('href="BinData/image1.png"');
    expect(manifest).toContain("<opf:title>한국사 문제지</opf:title>");
  });

  it("supports a compact six-question layout without orphan score paragraphs", () => {
    const packageBytes = createHwpxPackage({
      title: "중간고사",
      school: "샘플고",
      grade: "1학년",
      subject: "한국사",
      examName: "1학기 중간고사",
      examDate: "2026-07-25",
      columns: 2,
      questionsPerPage: 6,
      showStudentFields: false,
      showScores: false,
      headerXml: '<?xml version="1.0"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"/>',
      questions: [{
        data: new Uint8Array([137, 80, 78, 71]),
        width: 800,
        height: 1600,
        label: "원본 1번",
        score: 3,
      }],
    });

    const section = strFromU8(unzipSync(packageBytes)["Contents/section0.xml"]);
    expect(section).toContain("샘플고  |  1학년  |  한국사  |  1학기 중간고사  |  2026-07-25");
    expect(section).toContain('colCount="2"');
    expect(section).toContain('height="16500"');
    expect(section).not.toContain("학년 ______");
    expect(section).not.toContain("[3점]");
  });
});
