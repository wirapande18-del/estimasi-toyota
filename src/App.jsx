import {
  useState,
  useRef,
} from "react";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Tesseract from "tesseract.js";

export default function App() {
  const pdfRef = useRef();

  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [alamat, setAlamat] = useState("");
  const [polisi, setPolisi] = useState("");
  const [kendaraan, setKendaraan] = useState("");
  const [rangka, setRangka] = useState("");
  const [tahun, setTahun] = useState("");
  const [tglEstimasi, setTglEstimasi] = useState("");
  const [discPart, setDiscPart] = useState(0);
  const [discJasa, setDiscJasa] = useState(0);
  const [discPartManual, setDiscPartManual] = useState(0);
  const [discJasaManual, setDiscJasaManual] = useState(0);

  const [parts, setParts] = useState([]);
  const [jasa, setJasa] = useState([]);
  const handleFlatRateChange = (e) => {
  const type = e.target.value;

  setFlatRateType(type);

  const harga =
    flatRateList[type] || 0;

  setJasaName(type);
  setRate(1);
  setJasaPrice(harga);
};

  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");

  const [jasaName, setJasaName] = useState("LCGC");
  const [rate, setRate] = useState("1");
  const [jasaPrice, setJasaPrice] = useState("180930");
  const [flatRateType, setFlatRateType] =
  useState("LCGC");

const flatRateList = {
  "NEW ENTRY": 180930,
  "ECO": 256410,
  "PAS": 329670,
  "MEXL": 567210,
  "HEXL": 643800,
  "CBU": 643800,
  "LEXUS": 705960,
  "LCGC": 180930,
  "COM": 223110,
};

 const rupiah = (angka) => {
  const number = Math.round(Number(angka) || 0);
  return new Intl.NumberFormat("id-ID").format(number);
};

 const parsePrice = (value) => {
  if (!value) return 0;

  let text = String(value).trim();

  // hilangkan .00 di belakang
  text = text.replace(/\.00$/, "");

  // contoh 430,000 jadi 430000
  text = text.replace(/,/g, "");

  // contoh 430.000 jadi 430000
  text = text.replace(/\./g, "");

  return Number(text) || 0;
};
  const tambahPart = () => {
    const qtyNumber = Number(qty) || 0;
    const priceNumber = Number(price) || 0;
    const total = qtyNumber * priceNumber;

    const data = {
      partNo,
      partName,
      qty: qtyNumber,
      price: priceNumber,
      total,
    };

    setParts([...parts, data]);

    setPartNo("");
    setPartName("");
    setQty("");
    setPrice("");
  };

  const tambahJasa = () => {
    const rateNumber = Number(rate) || 0;
    const priceNumber = Number(jasaPrice) || 0;
    const total = rateNumber * priceNumber;

    const data = {
      jasaName,
      rate: rateNumber,
      jasaPrice: priceNumber,
      total,
    };

    setJasa([...jasa, data]);

    setJasaName("");
    setRate("");
    setJasaPrice("");
  };

  const totalParts = parts.reduce(
    (a, b) => a + (Number(b.total) || 0),
    0
  );

  const totalJasa = jasa.reduce(
    (a, b) => a + (Number(b.total) || 0),
    0
  );

  const dppParts = totalParts / 1.11;
  const dppJasa = totalJasa / 1.11;

  // Diskon spare part langsung input Rupiah manual
  const discPartAmount =
    Number(discPartManual) || 0;

  // Diskon jasa tetap pakai persen, bisa diubah manual di kolom Diskon Jasa (%)
  const discJasaAmount =
    dppJasa * ((Number(discJasa) || 0) / 100);

  const totalPartsAfterDisc =
    dppParts - discPartAmount;

  const totalJasaAfterDisc =
    dppJasa - discJasaAmount;

  const grandTotal =
    totalPartsAfterDisc + totalJasaAfterDisc;

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const result = await Tesseract.recognize(file, "eng", {
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });

    const text = result.data.text;

    const lines = text
      .split("\n")
      .map((x) => x.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    const newParts = [];

    const isBadLine = (line) => {
      const upper = line.toUpperCase();
      return (
        upper.includes("DENPASAR") ||
        upper.includes("DESTINATION") ||
        upper.includes("AGUNG TOYOTA") ||
        upper.includes("PART NO") ||
        upper.includes("PART NAME") ||
        upper.includes("SUBSTITUTION") ||
        upper.includes("SUBTITUTION") ||
        upper.includes("STOCK") ||
        upper.includes("RETAIL PRICE") ||
        upper.includes("MODEL CODE") ||
        upper.includes("ORDER LOT")
      );
    };

    const partNoRegex = /\b[0-9]{5}[A-Z0-9]{5}\b/i;
    const priceRegex = /\b\d{1,3}(?:[,.]\d{3})+(?:[,.]\d{2})?\b/g;

    lines.forEach((line) => {
      if (isBadLine(line)) return;

      const partNoMatch = line.match(partNoRegex);
      if (!partNoMatch) return;

      const partNoData = partNoMatch[0].toUpperCase();
      if (!/^[0-9]{5}[A-Z0-9]{5}$/.test(partNoData)) return;

      const priceMatches = line.match(priceRegex) || [];
      const priceText = priceMatches.length ? priceMatches[priceMatches.length - 1] : "0";
      let priceData = parsePrice(priceText);

      if (priceData >= 1000000) {
        priceData = Math.round(priceData / 100);
      }

      let partNameData = line
        .replace(partNoData, "")
        .replace(priceText, "")
        .replace(/\b[0-9]{5}[A-Z0-9]{5}\b/gi, "")
        .replace(/\bAvailable\b/gi, "")
        .replace(/\bNot\s*Available\b/gi, "")
        .replace(/\bNotAvailable\b/gi, "")
        .replace(/\bPNO\b/gi, "")
        .replace(/\bNEW\b/gi, "")
        .replace(/\bOLD\b/gi, "")
        .replace(/\bNO\b/gi, "")
        .replace(/[|©]/g, "")
        .replace(/^[^A-Z0-9]+/i, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!partNameData || partNameData.length < 3) return;

      newParts.push({
        partNo: partNoData,
        partName: partNameData,
        qty: 1,
        price: priceData,
        total: priceData,
      });
    });

    setParts((prev) => [...prev, ...newParts]);
    alert(`${newParts.length} Part berhasil ditambahkan`);
  };

  const handleSOImageUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const result = await Tesseract.recognize(
      file,
      "eng"
    );

    const text = result.data.text;
    const normalizedText = text
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ");

    const cleanValue = (value) => {
      return (value || "")
        .replace(/\s+/g, " ")
        .replace(/\s*:\s*$/, "")
        .replace(/^[:\s]+/, "")
        .trim();
    };

    const getLineValue = (label) => {
      const regex = new RegExp(
        label + "\\s*:?\\s*([^\\n\\r]*)",
        "i"
      );

      const match = normalizedText.match(regex);

      return match ? cleanValue(match[1]) : "";
    };

    const getBlockValue = (
      label,
      stopLabels = []
    ) => {
      const lines = normalizedText
        .split("\n")
        .map((x) => cleanValue(x))
        .filter(Boolean);

      const labelRegex = new RegExp(label, "i");
      const stopRegex = new RegExp(
        stopLabels.join("|"),
        "i"
      );

      let found = false;
      const collected = [];

      for (const line of lines) {
        if (!found && labelRegex.test(line)) {
          found = true;
          const value = cleanValue(
            line.replace(labelRegex, "")
          );
          if (value) collected.push(value);
          continue;
        }

        if (found) {
          if (stopLabels.length && stopRegex.test(line)) {
            break;
          }

          collected.push(line);
        }
      }

      return cleanValue(collected.join(" "));
    };

    const nama =
      getBlockValue("Nama", [
        "Alamat",
        "No\\.?\\s*Telepon",
        "C\\.?\\s*Person",
        "No\\s*Polisi",
      ]) || getLineValue("Nama");

    const alamatSO =
      getBlockValue("Alamat", [
        "No\\.?\\s*Telepon",
        "C\\.?\\s*Person",
        "No\\s*Polisi",
        "Masuk\\s*Tgl",
        "Masuk\\s*Jam",
      ]) || getLineValue("Alamat");

    const noTelp =
      getBlockValue("No\\.?\\s*Telepon", [
        "C\\.?\\s*Person",
        "No\\s*Polisi",
        "Alamat",
      ]) || getLineValue("No\\.?\\s*Telepon");

    const cPerson =
      getBlockValue("C\\.?\\s*Person", [
        "No\\s*Polisi",
        "Alamat",
        "Masuk\\s*Tgl",
      ]) || getLineValue("C\\.?\\s*Person");

    const model =
      getLineValue("Model") ||
      getLineValue("Type\\s*Kendaraan");

    const noPolMatch =
      normalizedText.match(/No\s*Polisi\s*:?\s*([A-Z0-9\-]+)/i) ||
      normalizedText.match(/\bDK[-\s]?[0-9A-Z]+[-\s]?[A-Z]+\b/i);

    const rangkaMatch =
      normalizedText.match(/FRM\s*:?\s*([A-Z0-9]+)/i) ||
      normalizedText.match(/No\s*Rangka\s*:?\s*([A-Z0-9]+)/i) ||
      normalizedText.match(/\b(MH[A-Z0-9]{10,})\b/i);

    const tahunMatch =
      normalizedText.match(/D\/D\s*:?\s*([0-9]{4})/i) ||
      normalizedText.match(/Tahun\s*:?\s*([0-9]{4})/i) ||
      normalizedText.match(/\b(20[0-9]{2})\b/);

    const estimasiMatch =
      normalizedText.match(/Janji\s*Penyerahan\s*:?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2}(?:\/[0-9]{1,2}:[0-9]{2})?)/i) ||
      normalizedText.match(/Janji\s*Penyerahan\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{4}(?:\s+[0-9]{1,2}:[0-9]{2})?)/i) ||
      normalizedText.match(/([0-9]{1,2}\s*(?:Mei|Jan|Feb|Mar|Apr|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s*20[0-9]{2})/i);

    setCustomer(nama);
    setAlamat(alamatSO);
    setPhone(noTelp);
    setContact(cPerson);
    setPolisi(noPolMatch ? cleanValue(noPolMatch[1] || noPolMatch[0]) : "");
    setKendaraan(model);
    setRangka(rangkaMatch ? cleanValue(rangkaMatch[1]) : "");
    setTahun(tahunMatch ? cleanValue(tahunMatch[1]) : "");
    setTglEstimasi(
      estimasiMatch ? cleanValue(estimasiMatch[1]) : ""
    );

    alert("Data Service Order berhasil dibaca");
  };

  const downloadPDF = async () => {
    const inputPdf = pdfRef.current;

    const canvas =
      await html2canvas(inputPdf, {
        scale: 2,
      });

    const imgData =
      canvas.toDataURL("image/png");

    const pdf = new jsPDF(
      "p",
      "mm",
      "a4"
    );

    const imgWidth = 210;

    const pageHeight = 295;

    const imgHeight =
      (canvas.height * imgWidth) /
      canvas.width;

    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(
      imgData,
      "PNG",
      0,
      position,
      imgWidth,
      imgHeight
    );

    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position =
        heightLeft - imgHeight;

      pdf.addPage();

      pdf.addImage(
        imgData,
        "PNG",
        0,
        position,
        imgWidth,
        imgHeight
      );

      heightLeft -= pageHeight;
    }

    pdf.save("estimasi.pdf");
  };

  return (
    <div
      style={{
        background: "#dfe3e6",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "Arial",
      }}
    >
      {/* FORM INPUT */}
      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "10px",
          marginBottom: "20px",
        }}
      >
        <h1
          style={{
            textAlign: "center",
          }}
        >
          FORM ESTIMASI TEST
        </h1>

        <h3>
          Informasi Kendaraan
        </h3>

        <input
          placeholder="No Polisi"
          value={polisi}
          onChange={(e) =>
            setPolisi(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Type Kendaraan"
          value={kendaraan}
          onChange={(e) =>
            setKendaraan(
              e.target.value
            )
          }
          style={input}
        />

        <input
          placeholder="No Rangka"
          value={rangka}
          onChange={(e) =>
            setRangka(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Tahun"
          value={tahun}
          onChange={(e) =>
            setTahun(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Tgl Estimasi"
          value={tglEstimasi}
          onChange={(e) =>
            setTglEstimasi(e.target.value)
          }
          style={input}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "15px",
            marginBottom: "15px",
          }}
        >
          <label
            style={btnSO}
          >
            📷 Upload Service Order

            <input
              type="file"
              accept="image/*"
              onChange={handleSOImageUpload}
              style={{
                display: "none",
              }}
            />
          </label>
        </div>

        <h3>
          Informasi Pelanggan
        </h3>

        <input
          placeholder="Nama Pelanggan"
          value={customer}
          onChange={(e) =>
            setCustomer(
              e.target.value
            )
          }
          style={input}
        />

        <input
          placeholder="Contact Person"
          value={contact}
          onChange={(e) =>
            setContact(
              e.target.value
            )
          }
          style={input}
        />

        <input
          placeholder="No Telepon"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Alamat"
          value={alamat}
          onChange={(e) =>
            setAlamat(e.target.value)
          }
          style={input}
        />

        <hr />

        <h3>Tambah Part</h3>

        <input
          placeholder="Part No"
          value={partNo}
          onChange={(e) =>
            setPartNo(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Part Name"
          value={partName}
          onChange={(e) =>
            setPartName(
              e.target.value
            )
          }
          style={input}
        />

        <input
          placeholder="Qty"
          value={qty}
          onChange={(e) =>
            setQty(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Price"
          value={price}
          onChange={(e) =>
            setPrice(e.target.value)
          }
          style={input}
        />

        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <button
            onClick={tambahPart}
            style={btnBlue}
          >
            Add Part
          </button>

          <label
            style={btnImage}
          >
            📷 Add from Image

            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{
                display: "none",
              }}
            />
          </label>
        </div>

        <hr />

        <h3>Tambah Jasa</h3>

        <select
  value={flatRateType}
  onChange={handleFlatRateChange}
  style={input}
>
  <option value="LCGC">LCGC</option>
  <option value="NEW ENTRY">NEW ENTRY</option>
  <option value="COM">COM</option>
  <option value="ECO">ECO</option>
  <option value="PAS">PAS</option>
  <option value="MEXL">MEXL</option>
  <option value="HEXL">HEXL</option>
  <option value="CBU">CBU</option>
  <option value="LEXUS">LEXUS</option>
</select>

        <input
          placeholder="Rate"
          value={rate}
          onChange={(e) =>
            setRate(e.target.value)
          }
          style={input}
        />

        <input
          placeholder="Price"
          value={jasaPrice}
          onChange={(e) =>
            setJasaPrice(
              e.target.value
            )
          }
          style={input}
        />

        <h4 style={{ marginBottom: "10px" }}>Diskon</h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div>
            <label>Diskon Spare Part (Rp)</label>
            <input
              type="number"
              placeholder="Contoh: 500000"
              value={discPartManual}
              onChange={(e) =>
                setDiscPartManual(e.target.value)
              }
              style={input}
            />
          </div>

          <div>
            <label>Diskon Jasa (%)</label>
            <input
              type="number"
              min="0"
              max="50"
              placeholder="Contoh: 20"
              value={discJasa}
              onChange={(e) =>
                setDiscJasa(e.target.value)
              }
              style={input}
            />
          </div>
        </div>

        <button
          onClick={tambahJasa}
          style={btnGreen}
        >
          Add Jasa
        </button>
    

        <button
          onClick={downloadPDF}
          style={btnPDF}
        >
          Download PDF
        </button>
      </div>

      {/* HASIL PDF */}
      <div
        ref={pdfRef}
        style={{
          width: "794px",
          margin: "auto",
          background: "white",
          padding: "40px",
          color: "black",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
          }}
        >
          <div>
            <h2>
              PT. AGUNG AUTOMALL
              GIANYAR
            </h2>

            <p>
              JL. BY PASS BURUAN BLAHBATUH GIANYAR
            </p>

            <p>
              TELP: 03614255474
            </p>
          </div>

          <h1
            style={{
              color: "#d71920",
            }}
          >
            TOYOTA
          </h1>
        </div>

        <h1
          style={{
            textAlign: "center",
            marginTop: "20px",
            fontSize: "42px",
            fontWeight: "bold",
          }}
        >
          ESTIMASI BIAYA
        </h1>

        {/* HEADER */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "40px",
            marginTop: "25px",
            fontSize: "15px",
            lineHeight: "24px",
            textAlign: "left",
          }}
        >
          <table style={headerTable}>
            <tbody>
              <tr>
                <td style={labelTd}>Nama Pelanggan</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{customer}</td>
              </tr>

              <tr>
                <td style={labelTd}>Contact Person</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{contact}</td>
              </tr>

              <tr>
                <td style={labelTd}>No. Telepon</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{phone}</td>
              </tr>

              <tr>
                <td style={labelTd}>Alamat</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{alamat}</td>
              </tr>
            </tbody>
          </table>

          <table style={headerTable}>
            <tbody>
              <tr>
                <td style={labelTd}>No. Polisi</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{polisi}</td>
              </tr>

              <tr>
                <td style={labelTd}>Type Kendaraan</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{kendaraan}</td>
              </tr>

              <tr>
                <td style={labelTd}>No. Rangka / Thn</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>
                  {rangka}
                  {tahun ? ` / ${tahun}` : ""}
                </td>
              </tr>

              <tr>
                <td style={labelTd}>Tanggal Estimasi</td>
                <td style={colonTd}>:</td>
                <td style={valueTd}>{tglEstimasi}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3
          style={{
            textAlign: "center",
            marginTop: "30px",
          }}
        >
          BERBAYAR / CHARGEABLE
        </h3>

        {/* TABLE PART */}
        <table
          width="100%"
          border="1"
          cellPadding="5"
          style={{
            borderCollapse:
              "collapse",
            fontSize: "12px",
          }}
        >
          <thead
            style={{
              background:
                "#dfe8e8",
            }}
          >
            <tr>
              <th>No</th>
              <th>Part No</th>
              <th>Part Name</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {parts.map(
              (item, index) => (
                <tr key={index}>
                  <td>
                    {index + 1}
                  </td>

                  <td>
                    {item.partNo}
                  </td>

                  <td>
                    {item.partName}
                  </td>

                <td>
  <input
    type="number"
    min="1"
    value={item.qty}
    onChange={(e) => {
      const updated = [...parts];

      updated[index].qty =
        Number(e.target.value);

      updated[index].total =
        updated[index].qty *
        updated[index].price;

      setParts(updated);
    }}
    style={{
      width: "40px",
      border: "none",
      background: "transparent",
      textAlign: "center",
      fontSize: "12px",
      fontWeight: "normal",
      outline: "none",
      padding: "0",
    }}
  />
</td>

                  <td>
                    Rp{" "}
                    {rupiah(
                      item.price
                    )}
                  </td>

                  <td>
                    Rp{" "}
                    {rupiah(
                      item.total
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {/* TABLE JASA */}
        <table
          width="100%"
          border="1"
          cellPadding="5"
          style={{
            borderCollapse:
              "collapse",
            fontSize: "12px",
            marginTop: "20px",
          }}
        >
          <thead
            style={{
              background:
                "#ece8d9",
            }}
          >
            <tr>
              <th>No</th>
              <th>Jasa</th>
              <th>Rate</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {jasa.map(
              (item, index) => (
                <tr key={index}>
                  <td>
                    {index + 1}
                  </td>

                  <td>
                    {item.jasaName}
                  </td>

                  <td>
                    {item.rate}
                  </td>

                  <td>
                    Rp{" "}
                    {rupiah(
                      item.jasaPrice
                    )}
                  </td>

                  <td>
                    Rp{" "}
                    {rupiah(
                      item.total
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {/* TOTAL */}
<div
  style={{
    marginTop: "15px",
    marginLeft: "auto",
    width: "360px",
    textAlign: "right",
    fontSize: "11px",
    lineHeight: "18px",
  }}
>
  <p>
    <b>Total Parts Sebelum PPN :</b> Rp {rupiah(dppParts)}
  </p>

  <p>
    <b>Diskon Spare Part :</b> Rp {rupiah(discPartAmount)}
  </p>

  <p>
    <b>Total Parts Setelah Diskon :</b> Rp {rupiah(totalPartsAfterDisc)}
  </p>

  <p>
    <b>Total Jasa Sebelum PPN :</b> Rp {rupiah(dppJasa)}
  </p>

  <p>
    <b>Diskon Jasa ({discJasa || 0}%) :</b> Rp {rupiah(discJasaAmount)}
  </p>

  <p>
    <b>Total Jasa Setelah Diskon :</b> Rp {rupiah(totalJasaAfterDisc)}
  </p>

  <div
    style={{
      marginTop: "8px",
      borderTop: "1px solid #000",
      paddingTop: "6px",
      fontSize: "20px",
      fontWeight: "bold",
    }}
  >
    Grand Total : Rp {rupiah(grandTotal)}
  </div>
</div>

        {/* FOOTER */}
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            marginTop: "30px",
            fontSize: "12px",
          }}
        >
          <div>
            <p>
              Disiapkan Oleh
            </p>

            <br />
            <br />

            <b>KOMANG AYU WARDANI</b>
          </div>

          <div>
            <p>
              Disetujui Oleh
            </p>

            <br />
            <br />

            <b>
              I NENGAH ANDIKA
            </b>
          </div>

          <div>
            <p>Pelanggan</p>

            <br />
            <br />

            _____
          </div>
        </div>
      </div>
    </div>
  );
}
const headerTable = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const labelTd = {
  width: "170px",
  fontWeight: "bold",
  verticalAlign: "top",
  paddingBottom: "6px",
};

const colonTd = {
  width: "12px",
  verticalAlign: "top",
  paddingBottom: "6px",
};

const valueTd = {
  verticalAlign: "top",
  paddingBottom: "6px",
  wordBreak: "break-word",
  textAlign: "left",
};

const tdStyle = {
  padding: "6px",
  verticalAlign: "top",
  wordBreak: "break-word",
};

const input = {
  width: "100%",
  padding: "10px",
  marginBottom: "10px",
  border: "1px solid #ccc",
  borderRadius: "5px",
};

const btnBlue = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "5px",
  cursor: "pointer",
  marginBottom: "10px",
};

const btnGreen = {
  background: "green",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "5px",
  cursor: "pointer",
  marginBottom: "10px",
};

const btnPDF = {
  background: "#dc2626",
  color: "white",
  border: "none",
  padding: "15px",
  borderRadius: "5px",
  cursor: "pointer",
  width: "100%",
  fontWeight: "bold",
};

const btnImage = {
  background: "#22c55e",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "5px",
  cursor: "pointer",
};

const btnSO = {
  background: "#16a34a",
  color: "white",
  padding: "12px 20px",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "bold",
};
