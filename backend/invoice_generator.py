"""
LOCOMART — Invoice PDF Generator (M9)
Generates clean, professional PDF order receipts/invoices using ReportLab.
Preserves order snapshot at order creation.
Includes Unicode Indian Rupee symbol, LOCOMART branding, and clear demo notice.
"""

import io
import os
import logging
from datetime import datetime
from typing import Any, Dict
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger("locomart.invoices")


def _esc(val: Any) -> str:
    """Safely escape text for ReportLab XML/HTML Paragraph markup."""
    if val is None:
        return ""
    return xml_escape(str(val))

# ---------------------------------------------------------------------------
# Font Registration (Unicode / Rupee Support)
# ---------------------------------------------------------------------------
_FONT_FAMILY = "Helvetica"
_FONT_FAMILY_BOLD = "Helvetica-Bold"
_CURRENCY_SYMBOL = "Rs. "
_FONT_INITIALIZED = False


def _init_fonts() -> None:
    global _FONT_FAMILY, _FONT_FAMILY_BOLD, _CURRENCY_SYMBOL, _FONT_INITIALIZED
    if _FONT_INITIALIZED:
        return

    candidate_fonts = [
        # Windows Segoe UI (has native Rupee glyph \u20b9)
        ("SegoeUI", "SegoeUI-Bold", r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"),
        # Windows Arial
        ("Arial", "Arial-Bold", r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        # Linux DejaVu Sans
        ("DejaVuSans", "DejaVuSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("DejaVuSans", "DejaVuSans-Bold", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ]

    for reg_name, reg_bold, reg_path, bold_path in candidate_fonts:
        if os.path.exists(reg_path) and os.path.exists(bold_path):
            try:
                pdfmetrics.registerFont(TTFont(reg_name, reg_path))
                pdfmetrics.registerFont(TTFont(reg_bold, bold_path))
                _FONT_FAMILY = reg_name
                _FONT_FAMILY_BOLD = reg_bold
                _CURRENCY_SYMBOL = "₹"
                logger.info(f"ReportLab registered font {reg_name} for invoice generation.")
                break
            except Exception as e:
                logger.warning(f"Could not register font {reg_name}: {e}")

    _FONT_INITIALIZED = True


def _format_date(iso_str: Any) -> str:
    """Safely format ISO date string to readable Indian standard format."""
    if not iso_str:
        return datetime.now().strftime("%d %b %Y, %I:%M %p")
    try:
        clean = str(iso_str).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(iso_str)


def generate_invoice_pdf(order: Dict[str, Any], invoice_number: str) -> bytes:
    """
    Generates professional PDF invoice bytes for the given order snapshot:
    - Order & Invoice Numbers
    - Shop Name, Address, Phone
    - Customer Name, Delivery Address, Phone
    - Products, Quantities, Unit Prices, Line Totals
    - Subtotal and Total Amount
    - Payment Method & Payment Status
    - Delivery Method (Hand to Customer / Leave at Door)
    - Order Status (e.g. Confirmed, Delivered)
    - Clear demo / non-tax invoice disclaimer
    - LOCOMART branding
    """
    _init_fonts()

    buffer = io.BytesIO()
    # Margins: 36 pt (0.5 inch)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
        title=f"Invoice {invoice_number}",
        author="LOCOMART Marketplace",
    )

    # Styles
    base_styles = getSampleStyleSheet()

    c_navy = colors.HexColor("#1E1B4B")
    c_indigo = colors.HexColor("#4338CA")
    c_slate = colors.HexColor("#475569")
    c_dark = colors.HexColor("#0F172A")
    c_border = colors.HexColor("#CBD5E1")
    c_bg_light = colors.HexColor("#F8FAFC")
    c_emerald = colors.HexColor("#059669")
    c_amber = colors.HexColor("#D97706")

    style_logo = ParagraphStyle(
        "InvoiceLogo",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=22,
        leading=26,
        textColor=c_indigo,
    )
    style_subtitle = ParagraphStyle(
        "InvoiceSubtitle",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=9,
        leading=12,
        textColor=c_slate,
    )
    style_header_title = ParagraphStyle(
        "InvoiceHeaderTitle",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=15,
        leading=18,
        textColor=c_navy,
        alignment=2,  # Right aligned
    )
    style_header_badge = ParagraphStyle(
        "InvoiceHeaderBadge",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#DC2626"),
        alignment=2,
    )
    style_header_meta = ParagraphStyle(
        "InvoiceHeaderMeta",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=9,
        leading=13,
        textColor=c_dark,
        alignment=2,
    )
    style_card_title = ParagraphStyle(
        "CardTitle",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=10,
        leading=13,
        textColor=c_indigo,
    )
    style_card_text = ParagraphStyle(
        "CardText",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=9,
        leading=13,
        textColor=c_dark,
    )
    style_tbl_head = ParagraphStyle(
        "TableHead",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=9,
        leading=11,
        textColor=colors.white,
    )
    style_tbl_cell = ParagraphStyle(
        "TableCell",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=9,
        leading=12,
        textColor=c_dark,
    )
    style_tbl_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=9,
        leading=12,
        textColor=c_dark,
    )
    style_tbl_cell_r = ParagraphStyle(
        "TableCellRight",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=9,
        leading=12,
        textColor=c_dark,
        alignment=2,
    )
    style_tbl_cell_r_bold = ParagraphStyle(
        "TableCellRightBold",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY_BOLD,
        fontSize=9,
        leading=12,
        textColor=c_dark,
        alignment=2,
    )
    style_disclaimer = ParagraphStyle(
        "DisclaimerText",
        parent=base_styles["Normal"],
        fontName=_FONT_FAMILY,
        fontSize=8,
        leading=11,
        textColor=c_slate,
        alignment=1,  # Centered
    )

    story = []

    # 1. Header Row (LOCOMART Branding on left, Invoice Details on right)
    shop = order.get("shop") or {}
    cust = order.get("customer") or {}
    addr = order.get("delivery_address") or {}

    left_header = [
        Paragraph("LOCOMART", style_logo),
        Paragraph("Hyperlocal Neighborhood Marketplace", style_subtitle),
        Spacer(1, 4),
        Paragraph(f"<b>Sold by:</b> {_esc(shop.get('name') or 'Neighborhood Store')}", style_card_text),
        Paragraph(f"{_esc(shop.get('address') or '')}{', ' + _esc(shop.get('city')) if shop.get('city') else ''}", style_subtitle),
        Paragraph(f"Phone: {_esc(shop.get('phone') or 'N/A')}", style_subtitle),
    ]

    pay_method = str(order.get("payment_method") or "COD").upper()
    pay_status = str(order.get("payment_status") or "PENDING").upper()
    deliv_method = str(order.get("delivery_method") or "HAND_TO_CUSTOMER").upper()
    raw_status = str(order.get("status") or "CONFIRMED").upper()
    order_status = raw_status.replace("_", " ")

    deliv_method_label = "Hand to Customer (OTP Handover)" if deliv_method == "HAND_TO_CUSTOMER" else "Leave at Door (Contactless)"
    pay_method_label = "Cash on Delivery (COD)" if pay_method == "COD" else "Online Payment (Stripe Card)"

    is_cancelled = raw_status == "CANCELLED"
    is_delivered = raw_status == "DELIVERED"
    is_online_paid = pay_method == "ONLINE" and pay_status == "PAID"

    order_date_str = _format_date(order.get("created_at"))

    # Dynamic Header Titles & Badges
    if is_cancelled:
        header_title = "CANCELLED ORDER"
        header_badge_text = "CANCELLED • REFUND INITIATED" if is_online_paid else "CANCELLED • NOT FULFILLED"
        header_badge_color = colors.HexColor("#DC2626")
    elif is_delivered:
        header_title = "DELIVERED RECEIPT"
        header_badge_text = "DELIVERED • COMPLETED"
        header_badge_color = colors.HexColor("#059669")
    else:
        header_title = "ORDER RECEIPT"
        header_badge_text = "DEMO DOCUMENT • NOT A TAX INVOICE"
        header_badge_color = colors.HexColor("#DC2626")

    right_header = [
        Paragraph(header_title, style_header_title),
        Paragraph(
            header_badge_text,
            ParagraphStyle(
                "DynamicHeaderBadge",
                parent=style_header_badge,
                textColor=header_badge_color,
            ),
        ),
        Spacer(1, 4),
        Paragraph(f"<b>Invoice #:</b> {_esc(invoice_number)}", style_header_meta),
        Paragraph(f"<b>Order ID:</b> {_esc(order.get('id'))}", style_header_meta),
        Paragraph(f"<b>Date:</b> {_esc(order_date_str)}", style_header_meta),
    ]

    header_table = Table(
        [[left_header, right_header]],
        colWidths=[310, 212],
    )
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 14))

    # Prominent Cancellation Warning Banner
    if is_cancelled:
        cancel_title = "CANCELLED — REFUND INITIATED" if is_online_paid else "CANCELLED — ORDER NOT FULFILLED"
        cancel_sub = "Refund has been initiated to your original payment method." if is_online_paid else "This order was cancelled by the store. Payment was not collected."
        cancellation_reason = order.get("cancellation_reason") or ""
        reason_para = f"<br/><font size='8' color='#7F1D1D'><b>Reason:</b> {_esc(cancellation_reason)}</font>" if cancellation_reason else ""
        story.append(
            Table(
                [[
                    Paragraph(
                        f"<b>⚠️ {cancel_title}</b><br/><font size='8.5' color='#991B1B'>{cancel_sub}</font>{reason_para}",
                        ParagraphStyle(
                            "CancelNotice",
                            parent=base_styles["Normal"],
                            fontName=_FONT_FAMILY_BOLD,
                            fontSize=10.5,
                            leading=14,
                            textColor=colors.HexColor("#991B1B"),
                            alignment=1,
                        ),
                    )
                ]],
                colWidths=[522],
                style=[
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
                    ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#DC2626")),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ],
            )
        )
        story.append(Spacer(1, 10))

    # Divider
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_indigo, spaceBefore=0, spaceAfter=14))

    # 2. Customer & Order Summary Details Box
    pay_status_color = "#059669" if pay_status == "PAID" else ("#DC2626" if pay_status in ("FAILED", "CANCELLED") else "#D97706")

    customer_col = [
        Paragraph("<b>DELIVER TO (CUSTOMER)</b>", style_card_title),
        Spacer(1, 3),
        Paragraph(f"<b>{_esc(cust.get('name') or addr.get('name') or 'Customer')}</b>", style_card_text),
        Paragraph(f"Phone: {_esc(cust.get('phone') or addr.get('phone') or 'N/A')}", style_card_text),
        Paragraph(f"Address: {_esc(addr.get('address') or '')}", style_card_text),
        Paragraph(f"{_esc(addr.get('city') or '')}, {_esc(addr.get('state') or '')} - {_esc(addr.get('pincode') or '')}", style_card_text),
    ]

    order_info_col = [
        Paragraph("<b>ORDER & PAYMENT STATUS</b>", style_card_title),
        Spacer(1, 3),
        Paragraph(f"<b>Delivery Mode:</b> {_esc(deliv_method_label)}", style_card_text),
        Paragraph(f"<b>Payment Method:</b> {_esc(pay_method_label)}", style_card_text),
        Paragraph(f"<b>Payment Status:</b> <font color='{pay_status_color}'><b>{_esc(pay_status)}</b></font>", style_card_text),
        Paragraph(f"<b>Fulfillment Status:</b> <b>{_esc(order_status)}</b>", style_card_text),
    ]

    refund_status = str(order.get("refund_status") or "").upper().replace("_", " ")
    if refund_status:
        order_info_col.append(Paragraph(f"<b>Refund Status:</b> <font color='#D97706'><b>{_esc(refund_status)}</b></font>", style_card_text))

    info_table = Table(
        [[customer_col, order_info_col]],
        colWidths=[260, 262],
    )
    info_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), c_bg_light),
            ("BOX", (0, 0), (-1, -1), 1, c_border),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(info_table)
    story.append(Spacer(1, 14))

    # 3. Itemized Snapshot Table
    # Columns: # (25), Item Name & Description (247), Unit (50), Qty (40), Unit Price (80), Total (80)
    col_widths = [25, 247, 50, 40, 80, 80]
    table_data = [
        [
            Paragraph("#", style_tbl_head),
            Paragraph("Item & Description", style_tbl_head),
            Paragraph("Unit", style_tbl_head),
            Paragraph("Qty", style_tbl_head),
            Paragraph("Price", style_tbl_head),
            Paragraph("Total", style_tbl_head),
        ]
    ]

    items = order.get("items") or []
    subtotal = float(order.get("subtotal") or 0.0)
    total = float(order.get("total") or 0.0)

    for idx, item in enumerate(items, 1):
        name = item.get("product_name") or item.get("product_name_snapshot") or f"Item #{idx}"
        desc = item.get("product_description") or ""
        unit_label = item.get("unit_label") or "piece"
        qty = int(item.get("quantity") or 1)
        unit_price = float(item.get("unit_price") or 0.0)
        item_subtotal = float(item.get("subtotal") or (unit_price * qty))

        item_para = [Paragraph(f"<b>{_esc(name)}</b>", style_tbl_cell)]
        if desc:
            item_para.append(Paragraph(f"<font color='#64748B'>{_esc(desc[:60])}</font>", style_subtitle))

        table_data.append([
            Paragraph(str(idx), style_tbl_cell),
            item_para,
            Paragraph(_esc(unit_label), style_tbl_cell),
            Paragraph(str(qty), style_tbl_cell),
            Paragraph(f"{_CURRENCY_SYMBOL}{unit_price:.2f}", style_tbl_cell_r),
            Paragraph(f"{_CURRENCY_SYMBOL}{item_subtotal:.2f}", style_tbl_cell_r_bold),
        ])

    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)

    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), c_navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, c_border),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]

    # Alternating row colors
    for r_idx in range(1, len(table_data)):
        if r_idx % 2 == 0:
            t_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.HexColor("#F8FAFC")))
        else:
            t_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.white))

    items_table.setStyle(TableStyle(t_style))
    story.append(items_table)
    story.append(Spacer(1, 10))

    # 4. Totals Summary Box (Aligned Right)
    delivery_fee = max(0.0, total - subtotal)
    totals_data = [
        [
            "",
            Paragraph("Items Subtotal:", style_tbl_cell_r),
            Paragraph(f"{_CURRENCY_SYMBOL}{subtotal:.2f}", style_tbl_cell_r_bold),
        ],
        [
            "",
            Paragraph("Delivery Charges:", style_tbl_cell_r),
            Paragraph(f"{_CURRENCY_SYMBOL}{delivery_fee:.2f} (Free / Included)" if delivery_fee == 0 else f"{_CURRENCY_SYMBOL}{delivery_fee:.2f}", style_tbl_cell_r),
        ],
        [
            "",
            Paragraph("<b>Total Amount:</b>", style_tbl_cell_r_bold),
            Paragraph(f"<b>{_CURRENCY_SYMBOL}{total:.2f}</b>", style_tbl_cell_r_bold),
        ],
    ]

    totals_table = Table(totals_data, colWidths=[262, 130, 130])
    totals_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("BACKGROUND", (1, 2), (2, 2), colors.HexColor("#EEF2FF")),
            ("BOX", (1, 2), (2, 2), 1, c_indigo),
        ])
    )
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # 5. Non-Tax Invoice Notice / Footer
    footer_elements = [
        HRFlowable(width="100%", thickness=0.5, color=c_border, spaceBefore=4, spaceAfter=8),
        Table(
            [[
                Paragraph(
                    "<b>LOCOMART DEMO NOTICE:</b> This order receipt is generated for demonstration and testing purposes. "
                    "It is <b>NOT</b> a tax invoice under GST/VAT regulations. Prices, product descriptions, and quantities "
                    "are recorded directly from the immutable order snapshot created at checkout time.",
                    style_disclaimer,
                )
            ]],
            colWidths=[522],
            style=[
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFBEB")),
                ("BOX", (0, 0), (-1, -1), 0.5, c_amber),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ],
        ),
        Spacer(1, 8),
        Paragraph("Thank you for choosing LOCOMART — Supporting your local neighborhood merchants.", style_disclaimer),
    ]

    story.append(KeepTogether(footer_elements))

    doc.build(story)
    return buffer.getvalue()
