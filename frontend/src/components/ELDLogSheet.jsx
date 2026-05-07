import { useEffect, useRef } from "react";

const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 760;

const ROWS = [
  { label: "Off Duty", status: "off_duty" },
  { label: "Sleeper Berth", status: "sleeper_berth" },
  { label: "Driving", status: "driving" },
  { label: "On Duty (Not Driving)", status: "on_duty_not_driving" },
];

const getRowIndex = (status) => ROWS.findIndex((row) => row.status === status);

export default function ELDLogSheet({ sheet, recap, registerCanvas, index }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !sheet) return;
    registerCanvas?.(index, canvasRef.current);

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = "#0b1f3a";
    ctx.lineWidth = 1;

    ctx.fillStyle = "#0b1f3a";
    ctx.font = "20px 'Bebas Neue'";
    ctx.fillText("Driver's Daily Log", 40, 40);

    ctx.font = "12px 'Source Sans 3'";
    ctx.fillText(`Date: ${sheet.date}`, 40, 65);
    ctx.fillText(`Total Miles: ${sheet.total_miles}`, 200, 65);
    ctx.fillText(`Truck Number: ${sheet.vehicle_number || ""}`, 340, 65);
    ctx.fillText(`Carrier: ${sheet.carrier_name || ""}`, 520, 65);
    ctx.fillText(`Main Office: ${sheet.main_office_address || ""}`, 40, 85);
    ctx.fillText(`Driver: ${sheet.driver_name || ""}`, 40, 105);
    ctx.fillText(`Co-Driver: ${sheet.co_driver || ""}`, 300, 105);
    ctx.fillText("Driver Signature:", 520, 105);
    ctx.beginPath();
    ctx.moveTo(630, 102);
    ctx.lineTo(980, 102);
    ctx.stroke();

    const gridX = 40;
    const gridY = 130;
    const gridW = 860;
    const gridH = 280;
    const rowH = gridH / ROWS.length;

    ctx.strokeRect(gridX, gridY, gridW, gridH);

    for (let i = 1; i < ROWS.length; i += 1) {
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + rowH * i);
      ctx.lineTo(gridX + gridW, gridY + rowH * i);
      ctx.stroke();
    }

    for (let i = 0; i <= 24; i += 1) {
      const x = gridX + (gridW / 24) * i;
      ctx.beginPath();
      ctx.moveTo(x, gridY);
      ctx.lineTo(x, gridY + gridH);
      ctx.strokeStyle = i % 2 === 0 ? "#102a4c" : "#c7d7ea";
      ctx.stroke();

      if (i < 24) {
        for (let q = 1; q < 4; q += 1) {
          const tickX = x + (gridW / 24) * (q / 4);
          ctx.beginPath();
          ctx.moveTo(tickX, gridY + gridH);
          ctx.lineTo(tickX, gridY + gridH - 8);
          ctx.strokeStyle = "#c7d7ea";
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "#0b1f3a";
    ctx.font = "11px 'Source Sans 3'";
    for (let i = 0; i < 24; i += 1) {
      const label = i === 12 ? "Noon" : i.toString();
      const x = gridX + (gridW / 24) * i + 2;
      ctx.fillText(label, x, gridY - 6);
    }

    ctx.font = "12px 'Source Sans 3'";
    ROWS.forEach((row, idx) => {
      ctx.fillText(row.label, gridX - 120, gridY + rowH * idx + rowH / 2 + 4);
    });

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;

    const sortedSegments = [...(sheet.segments || [])].sort(
      (a, b) => a.start_hour - b.start_hour
    );

    sortedSegments.forEach((segment) => {
      const rowIndex = getRowIndex(segment.status);
      if (rowIndex < 0) return;
      const startX = gridX + (gridW / 24) * segment.start_hour;
      const endX = gridX + (gridW / 24) * segment.end_hour;
      const y = gridY + rowH * rowIndex + rowH / 2;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    });

    ctx.strokeStyle = "#0b1f3a";
    ctx.lineWidth = 2;
    for (let i = 1; i < sortedSegments.length; i += 1) {
      const prev = sortedSegments[i - 1];
      const curr = sortedSegments[i];
      if (Math.abs(prev.end_hour - curr.start_hour) > 0.01) continue;
      const prevRow = getRowIndex(prev.status);
      const currRow = getRowIndex(curr.status);
      if (prevRow < 0 || currRow < 0) continue;
      const x = gridX + (gridW / 24) * curr.start_hour;
      const y1 = gridY + rowH * prevRow + rowH / 2;
      const y2 = gridY + rowH * currRow + rowH / 2;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    }

    const totalsX = gridX + gridW + 15;
    ctx.font = "12px 'Source Sans 3'";
    ctx.fillText("Total Hours", totalsX, gridY - 10);
    ROWS.forEach((row, idx) => {
      const total = sheet.total_hours?.[row.status] ?? 0;
      ctx.fillText(total.toFixed(2), totalsX, gridY + rowH * idx + rowH / 2 + 4);
    });

    const remarksY = gridY + gridH + 40;
    ctx.font = "12px 'Source Sans 3'";
    ctx.fillText("Remarks", gridX, remarksY);
    ctx.strokeRect(gridX, remarksY + 8, gridW + 120, 90);

    const remarks = sheet.remarks || [];
    remarks.slice(0, 4).forEach((remark, idx) => {
      const text = `${remark.time} - ${remark.location} - ${remark.note}`;
      ctx.fillText(text, gridX + 10, remarksY + 28 + idx * 18);
    });

    const recapY = remarksY + 130;
    ctx.fillText("70 Hour / 8 Day Recap", gridX, recapY);
    ctx.strokeRect(gridX, recapY + 8, gridW + 120, 70);

    const recapValues = recap?.daily || Array(8).fill(0);
    const columnWidth = (gridW + 120) / 8;
    recapValues.forEach((value, idx) => {
      const x = gridX + columnWidth * idx;
      ctx.strokeRect(x, recapY + 8, columnWidth, 70);
      ctx.fillText(`Day ${idx + 1}`, x + 6, recapY + 26);
      ctx.fillText(`${value.toFixed(1)} hrs`, x + 6, recapY + 46);
    });

    ctx.fillText(
      `Total On Duty: ${recap?.totalOnDuty?.toFixed(1) || "0.0"} hrs | Remaining: ${
        recap?.remaining?.toFixed(1) || "0.0"
      } hrs`,
      gridX,
      recapY + 95
    );
  }, [sheet, recap, registerCanvas, index]);

  return (
    <div className="glass-panel hover-soft rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        data-log-sheet
        className="w-full"
      />
    </div>
  );
}
