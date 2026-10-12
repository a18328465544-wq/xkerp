import type {ReactNode} from "react";
import {ErpMobileRecordRow} from "./ErpMobileRecordRow";

/** Display-only document projection. Values, permissions and actions remain domain-owned. */
export function ErpDocumentRecordRow({documentNo, status, quantity, party, handler, date, summary, relatedDocument, amount, amountLabel, onOpen}: {
  documentNo: string;
  status?: ReactNode;
  quantity?: ReactNode;
  party?: ReactNode;
  handler?: string;
  date?: ReactNode;
  summary?: ReactNode;
  relatedDocument?: ReactNode;
  amount?: ReactNode;
  amountLabel?: ReactNode;
  onOpen?: () => void;
}) {
  return <ErpMobileRecordRow layout="document" title={documentNo} statusPlacement="title"
    status={<span className="erp-document-row-state">{status}{quantity !== undefined && quantity !== null && <span>{quantity}</span>}</span>}
    subtitle={party || handler ? <>{party}{handler && <span className="erp-document-row-handler">经办人 · {handler}</span>}</> : undefined}
    meta={summary || relatedDocument || date ? <>{summary && <span>{summary}</span>}{relatedDocument && <span>关联单据 · {relatedDocument}</span>}{date && <span>{date}</span>}</> : undefined}
    amount={amount} amountLabel={amountLabel} onOpen={onOpen} />;
}
