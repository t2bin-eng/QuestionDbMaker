import { PdfReviewEditor } from "@/components/pdf-review-editor";

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PdfReviewEditor documentId={id} />;
}
