from io import BytesIO
from zipfile import ZipFile

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from pypdf import PdfReader


class UnsupportedDocumentError(ValueError):
    """The uploaded bytes are unsupported, malformed, or contain no text layer."""


class UnsupportedDocumentTypeError(UnsupportedDocumentError):
    """The file extension is outside the supported upload contract."""


def extract_document_text(filename: str, content: bytes) -> str:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix not in {"pdf", "docx"}:
        raise UnsupportedDocumentTypeError("Only PDF and DOCX files are supported")
    if suffix == "pdf" and content.startswith(b"%PDF-"):
        try:
            reader = PdfReader(BytesIO(content), strict=True)
            if reader.is_encrypted:
                raise UnsupportedDocumentError("Password-protected PDFs are not supported")
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except UnsupportedDocumentError:
            raise
        except Exception as error:
            raise UnsupportedDocumentError("PDF is invalid or unreadable") from error
        if not text.strip():
            raise UnsupportedDocumentError("PDF has no extractable text layer")
        return text

    if suffix == "docx" and content.startswith(b"PK"):
        try:
            with ZipFile(BytesIO(content)) as archive:
                entries = archive.infolist()
                if sum(entry.file_size for entry in entries) > 100 * 1024 * 1024:
                    raise UnsupportedDocumentError("DOCX expands beyond the allowed processing limit")
                if any(entry.flag_bits & 0x1 for entry in entries):
                    raise UnsupportedDocumentError("Encrypted DOCX files are not supported")
                names = {entry.filename for entry in entries}
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise UnsupportedDocumentError("DOCX structure is invalid")
            document = Document(BytesIO(content))
            paragraphs: list[str] = []
            for element in document.element.body.iterchildren():
                if isinstance(element, CT_P):
                    paragraphs.append(Paragraph(element, document).text)
                elif isinstance(element, CT_Tbl):
                    table = Table(element, document)
                    paragraphs.extend("\t".join(cell.text for cell in row.cells) for row in table.rows)
            text = "\n".join(part for part in paragraphs if part.strip())
        except UnsupportedDocumentError:
            raise
        except Exception as error:
            raise UnsupportedDocumentError("DOCX is invalid or unreadable") from error
        if not text.strip():
            raise UnsupportedDocumentError("DOCX contains no extractable text")
        return text

    raise UnsupportedDocumentError("Only valid PDF and DOCX files are supported")
