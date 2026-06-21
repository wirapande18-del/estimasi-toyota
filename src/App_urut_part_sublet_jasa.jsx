import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Tesseract from "tesseract.js";
import { supabase } from "./lib/supabase";
import "./index.css";

const rupiah = (angka) => new Intl.NumberFormat("id-ID").format(Math.round(Number(angka) || 0));
const toNumber = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;
const toDecimal = (v) => Number(String(v || "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const defaultParts = [
  { partNo: "08880-85986", partName: "TMO 10W-30 SN 1L", price: 117000 },
  { partNo: "15601-BZ030", partName: "OIL FILTER", price: 30000 },
  { partNo: "GSKT1-FIXCL", partName: "GASKET OLI MESIN", price: 12000 },
];
const flatRateList = {
  "Tidak Ada": 0,
  "LGGC": 180930,
  "LCGC": 180930,
  "NEW ENTRY": 180930,
  "COM": 223110,
  "ECO": 256410,
  "PAS": 329670,
  "MEXL": 567210,
  "HEXL": 643800,
  "CBU": 643800,
  "LEXUS": 705960,
};
const flatRateOptions = Object.keys(flatRateList);

const norm = (v) => String(v || "").replace(/\s|-/g, "").toUpperCase();
const findBestPart = (db, key, value) => {
  const q = String(value || "").trim().toUpperCase();
  if (!q) return null;
  return db.find((x) => String(x[key] || "").toUpperCase().startsWith(q))
    || db.find((x) => String(x[key] || "").toUpperCase().includes(q))
    || null;
};
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const partFromDb = (x) => ({ id: x.id, partNo: x.part_no || "", partName: x.part_name || "", price: Number(x.price) || 0 });
const partToDb = (x) => ({ part_no: x.partNo || "", part_name: x.partName || "-", price: Number(x.price) || 0 });
const customerFromDb = (x) => ({ id: x.id, polisi: x.polisi || "", kendaraan: x.kendaraan || "", rangka: x.rangka || "", tahun: x.tahun || "", customer: x.customer || "", contact: x.contact || "", phone: x.phone || "", alamat: x.alamat || "" });
const customerToDb = (x) => ({ polisi: x.polisi || "", kendaraan: x.kendaraan || "", rangka: x.rangka || "", tahun: x.tahun || "", customer: x.customer || "", contact: x.contact || "", phone: x.phone || "", alamat: x.alamat || "" });

const emptyForm = {
  polisi: "", kendaraan: "", rangka: "", tahun: "", customer: "", contact: "", phone: "", alamat: "",
  staff: "Komang Ayu Wardani", jabatan: "", kepalaBengkel: "I Nengah Andika",
  parts: [], sublets: [], jasa: [], discPartPct: 0, discPartRp: 0, discJasaPct: 0, discJasaRp: 0,
};

export default function App() {
  const pdfRef = useRef(null);
  const filePartRef = useRef(null);
  const fileCustomerRef = useRef(null);
  const [page, setPage] = useState("estimasi");
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState(() => load("estimasi_history_v5", []));
  const [partDb, setPartDb] = useState(() => load("sparepart_db_v5", defaultParts));
  const [customerDb, setCustomerDb] = useState(() => load("customer_db_v5", []));
  const [repairType, setRepairType] = useState("");

  useEffect(() => save("estimasi_history_v5", history), [history]);
  useEffect(() => save("sparepart_db_v5", partDb), [partDb]);
  useEffect(() => save("customer_db_v5", customerDb), [customerDb]);

  // Load data online dari Supabase saat aplikasi dibuka.
  useEffect(() => {
    const loadOnlineData = async () => {
      try {
        const [partsRes, customersRes, historyRes] = await Promise.all([
          supabase.from("spareparts").select("*").order("part_no", { ascending: true }),
          supabase.from("customers").select("*").order("polisi", { ascending: true }),
          supabase.from("estimasi_history").select("*").order("created_at", { ascending: false }),
        ]);

        if (!partsRes.error && partsRes.data) {
          const onlineParts = partsRes.data.map(partFromDb);
          setPartDb(onlineParts.length ? onlineParts : defaultParts);
        } else if (partsRes.error) {
          console.warn("Supabase parts error:", partsRes.error.message);
        }

        if (!customersRes.error && customersRes.data) {
          setCustomerDb(customersRes.data.map(customerFromDb));
        } else if (customersRes.error) {
          console.warn("Supabase customer error:", customersRes.error.message);
        }

        if (!historyRes.error && historyRes.data) {
          setHistory(historyRes.data.map((x) => ({ id: x.id, ...(x.data || {}), grandTotal: Number(x.grand_total) || Number(x.data?.grandTotal) || 0 })));
        } else if (historyRes.error) {
          console.warn("Supabase history error:", historyRes.error.message);
        }
      } catch (err) {
        console.warn("Gagal load Supabase:", err);
      }
    };

    loadOnlineData();
  }, []);

  // Otomatis simpan data customer baru saat No Polisi sudah terisi.
  useEffect(() => {
    if (!form.polisi || (!form.customer && !form.kendaraan && !form.rangka && !form.phone && !form.alamat)) return;
    const data = {
      polisi: form.polisi, kendaraan: form.kendaraan, rangka: form.rangka, tahun: form.tahun,
      customer: form.customer, contact: form.contact, phone: form.phone, alamat: form.alamat,
    };
    setCustomerDb((prev) => {
      const key = form.polisi.replace(/\s|-/g, "").toUpperCase();
      const idx = prev.findIndex((x) => (x.polisi || "").replace(/\s|-/g, "").toUpperCase() === key);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, ...data } : x);
      return [...prev, data];
    });
  }, [form.polisi, form.kendaraan, form.rangka, form.tahun, form.customer, form.contact, form.phone, form.alamat]);

  const totals = useMemo(() => {
    const totalParts = form.parts.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalSublet = form.sublets.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalJasa = form.jasa.reduce((a, b) => a + (Number(b.total) || 0), 0);

    // Rumus diskon sesuai permintaan:
    // Harga include PPN dibagi 1.11 dulu, sisa DPP dikalikan diskon,
    // setelah diskon baru ditambah PPN 11% lagi.
    const dppParts = totalParts / 1.11;
    const dppJasa = totalJasa / 1.11;

    const discParts = dppParts * ((Number(form.discPartPct) || 0) / 100) + (Number(form.discPartRp) || 0);
    const discJasa = dppJasa * ((Number(form.discJasaPct) || 0) / 100) + (Number(form.discJasaRp) || 0);

    const totalPartsAfterDisc = Math.max(dppParts - discParts, 0) * 1.11;
    const totalJasaAfterDisc = Math.max(dppJasa - discJasa, 0) * 1.11;
    const grandTotal = totalPartsAfterDisc + totalSublet + totalJasaAfterDisc;

    return { totalParts, totalSublet, totalJasa, dppParts, dppJasa, discParts, discJasa, totalPartsAfterDisc, totalJasaAfterDisc, grandTotal };
  }, [form]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const addPart = () => setForm((p) => ({ ...p, parts: [...p.parts, { id: uid(), free: false, partNo: "", partName: "", qty: 1, price: 0, total: 0 }] }));
  const addSublet = () => setForm((p) => ({ ...p, sublets: [...p.sublets, { id: uid(), subletNo: "", subletName: "", qty: 1, price: 0, total: 0 }] }));
  const addJasa = () => {
    const flatPrice = flatRateList[repairType] || 0;
    setForm((p) => ({
      ...p,
      jasa: [
        ...p.jasa,
        { id: uid(), free: false, jasaName: "", rate: 1, price: flatPrice, total: flatPrice },
      ],
    }));
  };

  const handleFlatRateChange = (type) => {
    setRepairType(type);
    const price = flatRateList[type] || 0;
    setForm((p) => {
      const rows = p.jasa.length
        ? [...p.jasa]
        : [{ id: uid(), free: false, jasaName: "", rate: 1, price, total: price }];

      const updatedRows = rows.map((row) => {
        const rateValue = toDecimal(row.rate) || 0;
        return {
          ...row,
          price,
          total: rateValue * price,
        };
      });

      return { ...p, jasa: updatedRows };
    });
  };

  const updateRow = (type, id, key, value) => {
    setForm((p) => ({
      ...p,
      [type]: p[type].map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [key]: value };
        if (type === "parts" && key === "partNo") {
          const found = partDb.find((x) => String(x.partNo || "").toUpperCase() === String(value || "").toUpperCase());
          if (found) {
            next.partNo = found.partNo;
            next.partName = found.partName;
            next.price = found.price;
          }
        }
        if (type === "parts" && key === "partName") {
          // Part name tetap bisa diketik/edit/hapus manual.
          // Jika dipilih persis dari master, baru otomatis isi part no dan harga.
          const q = String(value || "").trim().toUpperCase();
          const found = partDb.find((x) => String(x.partName || "").trim().toUpperCase() === q);
          if (found) {
            next.partNo = found.partNo;
            next.partName = found.partName;
            next.price = found.price;
          }
        }
        if (type === "jasa") {
          const flatPrice = flatRateList[repairType] || 0;
          if (flatPrice > 0) next.price = flatPrice;
          const rate = toDecimal(next.rate);
          const price = Number(next.price) || 0;
          next.total = rate * price;
        } else {
          const qty = Number(next.qty) || 0;
          const price = Number(next.price) || 0;
          next.total = qty * price;
        }
        if (type === "parts" && next.partNo && (next.partName || next.price)) {
          const data = { partNo: next.partNo, partName: next.partName || "-", price: Number(next.price) || 0 };
          setPartDb((prevDb) => {
            const idx = prevDb.findIndex((x) => (x.partNo || "").toUpperCase() === data.partNo.toUpperCase());
            if (idx >= 0) return prevDb.map((x, i) => i === idx ? { ...x, ...data } : x);
            return [...prevDb, data];
          });
        }
        return next;
      }),
    }));
  };
  const deleteRow = (type, id) => setForm((p) => ({ ...p, [type]: p[type].filter((r) => r.id !== id) }));

  const findCustomerByPlate = (plate) => {
    const q = norm(plate);
    if (!q) return;
    // Auto isi hanya kalau nomor polisi sudah sama persis.
    // Jadi saat baru ketik "DK" data tidak langsung berubah.
    const found = customerDb.find((c) => norm(c.polisi) === q);
    if (found) {
      setForm((p) => ({
        ...p,
        polisi: plate.toUpperCase(),
        kendaraan: found.kendaraan || "",
        rangka: found.rangka || "",
        tahun: found.tahun || "",
        customer: found.customer || "",
        contact: found.contact || "",
        phone: found.phone || "",
        alamat: found.alamat || "",
      }));
    }
  };

  const saveMasterFromCurrent = async (showAlert = true) => {
    const newParts = [...partDb];
    form.parts.forEach((p) => {
      if (!p.partNo) return;
      const idx = newParts.findIndex((x) => x.partNo.toUpperCase() === p.partNo.toUpperCase());
      const data = { partNo: p.partNo, partName: p.partName, price: Number(p.price) || 0 };
      if (idx >= 0) newParts[idx] = { ...newParts[idx], ...data }; else newParts.push(data);
    });

    let newCustomers = [...customerDb];
    if (form.polisi) {
      const data = { polisi: form.polisi, kendaraan: form.kendaraan, rangka: form.rangka, tahun: form.tahun, customer: form.customer, contact: form.contact, phone: form.phone, alamat: form.alamat };
      const idx = newCustomers.findIndex((x) => norm(x.polisi) === norm(form.polisi));
      if (idx >= 0) newCustomers = newCustomers.map((x, i) => i === idx ? { ...x, ...data } : x);
      else newCustomers.push(data);
    }

    setPartDb(newParts);
    setCustomerDb(newCustomers);

    try {
      const partsForDb = newParts.filter((p) => p.partNo).map(partToDb);
      const customersForDb = newCustomers.filter((c) => c.polisi).map(customerToDb);

      if (partsForDb.length) {
        const { error } = await supabase.from("spareparts").upsert(partsForDb, { onConflict: "part_no" });
        if (error) throw error;
      }

      if (customersForDb.length) {
        const { error } = await supabase.from("customers").upsert(customersForDb, { onConflict: "polisi" });
        if (error) throw error;
      }

      if (showAlert) alert("Database sparepart dan customer sudah disimpan online di Supabase.");
    } catch (err) {
      console.error(err);
      if (showAlert) alert("Data tersimpan di browser, tapi gagal simpan ke Supabase. Cek RLS policy / internet.");
    }
  };

  const saveHistory = async () => {
    await saveMasterFromCurrent(false);
    const data = { id: form.id || uid(), ...form, grandTotal: totals.grandTotal, createdAt: form.createdAt || new Date().toLocaleString("id-ID"), updatedAt: new Date().toLocaleString("id-ID") };
    setHistory((prev) => prev.some((x) => x.id === data.id) ? prev.map((x) => x.id === data.id ? data : x) : [data, ...prev]);
    setForm(data);

    try {
      const row = { data, grand_total: totals.grandTotal };
      let saved;
      if (isUuid(data.id)) {
        const { data: res, error } = await supabase.from("estimasi_history").upsert({ id: data.id, ...row }).select().single();
        if (error) throw error;
        saved = res;
      } else {
        const { data: res, error } = await supabase.from("estimasi_history").insert(row).select().single();
        if (error) throw error;
        saved = res;
      }
      if (saved?.id) {
        const synced = { ...data, id: saved.id };
        setForm(synced);
        setHistory((prev) => prev.some((x) => x.id === synced.id) ? prev.map((x) => x.id === synced.id ? synced : x) : [synced, ...prev.filter((x) => x.id !== data.id)]);
      }
      alert("Estimasi masuk history online dan bisa diedit lagi.");
    } catch (err) {
      console.error(err);
      alert("Estimasi tersimpan di browser, tapi gagal simpan ke Supabase. Cek RLS policy / internet.");
    }
  };

  const resetForm = () => setForm(emptyForm);
  const editHistory = (h) => { setForm(h); setPage("estimasi"); };

  const parsePartText = (text) => {
    const cleanLine = (line) => String(line || "")
      .replace(/[|]/g, " ")
      .replace(/\b(RP|IDR)\b/gi, " ")
      .replace(/[,]/g, ".")
      .replace(/\s+/g, " ")
      .trim();

    const isHeader = (line) => /part\s*no|part\s*name|retail\s*price|stock|model|qty|total|price/i.test(line);
    const findPrice = (line) => {
      const nums = [...line.matchAll(/\b\d{1,3}(?:[.]\d{3})+\b|\b\d{4,9}\b/g)]
        .map((m) => ({ raw: m[0], value: toNumber(m[0]) }))
        .filter((x) => x.value >= 1000 && x.value <= 5000000);
      if (!nums.length) return null;
      return nums[nums.length - 1];
    };

    const lines = String(text || "").split(/\n/).map(cleanLine).filter(Boolean).filter((x)=>!isHeader(x));
    const joinedRows = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const hasPart = /\b[0-9A-Z]{5}[-\s]?[0-9A-Z]{4,6}\b/i.test(line);
      const hasPrice = !!findPrice(line);
      // Jika OCR memecah nama/harga ke baris berikutnya, gabungkan maksimal 2 baris.
      if (hasPart && !hasPrice && lines[i + 1]) {
        line = `${line} ${lines[i + 1]}`;
        i++;
        if (!findPrice(line) && lines[i + 1]) { line = `${line} ${lines[i + 1]}`; i++; }
      }
      joinedRows.push(line);
    }

    const result = [];
    for (const lineRaw of joinedRows) {
      const line = cleanLine(lineRaw);
      const partMatch = line.match(/\b[0-9A-Z]{5}[-\s]?[0-9A-Z]{4,6}\b/i);
      if (!partMatch) continue;
      const partNo = partMatch[0].replace(/\s+/g, "-").toUpperCase();
      const priceObj = findPrice(line);
      if (!priceObj) continue;
      let price = priceObj.value;
      if (price > 5000000) price = Math.round(price / 100);

      let name = line
        .replace(partMatch[0], " ")
        .replace(priceObj.raw, " ")
        .replace(/available|not available|retail price|stock depo|stock cpd|depo|cpd|pcs|pc/gi, " ")
        .replace(/\b\d{1,3}\b/g, " ")
        .replace(/[^0-9A-Z .\-/]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!name || name.length < 2) name = "-";
      result.push({ id: uid(), free: false, partNo, partName: name, qty: 1, price, total: price });
    }
    return result;
  };

  const addPartsFromImage = async (file) => {
    if (!file) return;
    const res = await Tesseract.recognize(file, "eng");
    const rows = parsePartText(res.data.text);
    setForm((p) => ({ ...p, parts: [...p.parts, ...rows] }));
    setPartDb((prev) => {
      const db = [...prev]; rows.forEach((r) => { const i = db.findIndex((x) => x.partNo === r.partNo); const d = { partNo: r.partNo, partName: r.partName, price: r.price }; if (i >= 0) db[i] = d; else db.push(d); }); return db;
    });
    alert(`${rows.length} part berhasil dibaca dari gambar.`);
  };

  const handlePaste = async (e) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item && page === "estimasi") addPartsFromImage(item.getAsFile());
  };

  const downloadPDF = async () => {
    await saveHistory();
    const canvas = await html2canvas(pdfRef.current, { scale: 3, useCORS: true, scrollY: 0 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 8, imgWidth, imgHeight);
    pdf.save(`estimasi-${form.polisi || "baru"}.pdf`);
  };

  return <div onPaste={handlePaste} style={styles.app}>
    <aside style={styles.sidebar}><div style={styles.logo}>WS</div><div style={styles.nav}>⌂ Home</div><div style={styles.navActive}>⚙ Estimasi ›</div><button style={page==="estimasi"?styles.menuOn:styles.menu} onClick={()=>setPage("estimasi")}>▣ Buat Estimasi</button><button style={page==="history"?styles.menuOn:styles.menu} onClick={()=>setPage("history")}>↻ History Estimasi</button><button style={page==="sparepart"?styles.menuOn:styles.menu} onClick={()=>setPage("sparepart")}>🔧 Master Sparepart</button><button style={page==="customer"?styles.menuOn:styles.menu} onClick={()=>setPage("customer")}>👤 Master Customer</button></aside>
    <main style={styles.main}>{page==="estimasi" && <Estimasi form={form} setField={setField} addPart={addPart} updateRow={updateRow} deleteRow={deleteRow} addSublet={addSublet} addJasa={addJasa} totals={totals} repairType={repairType} setRepairType={setRepairType} handleFlatRateChange={handleFlatRateChange} partDb={partDb} customerDb={customerDb} findCustomerByPlate={findCustomerByPlate} saveMasterFromCurrent={saveMasterFromCurrent} saveHistory={saveHistory} downloadPDF={downloadPDF} resetForm={resetForm} filePartRef={filePartRef} addPartsFromImage={addPartsFromImage} pdfRef={pdfRef}/>} {page==="history" && <History history={history} editHistory={editHistory} setHistory={setHistory} newForm={() => {resetForm(); setPage("estimasi")}}/>} {page==="sparepart" && <MasterPart partDb={partDb} setPartDb={setPartDb}/>} {page==="customer" && <MasterCustomer customerDb={customerDb} setCustomerDb={setCustomerDb}/>}</main>
  </div>;
}

function Estimasi(p){ const f=p.form; const customers = p.customerDb || []; return <><section style={styles.card}><h2 style={{textAlign:"center"}}>FORM ESTIMASI</h2><div style={styles.tabs}><b>Profile</b><b>Estimasi Biaya</b></div><h3>🚙 Informasi Kendaraan</h3><div style={styles.grid4}><Input label="No Polisi *" list="polisi-list" value={f.polisi} onChange={(v)=>{ const plat = String(v || "").toUpperCase(); p.setField("polisi", plat); p.findCustomerByPlate(plat); }}/><Input label="Type Kendaraan *" list="kendaraan-list" value={f.kendaraan} onChange={(v)=>p.setField("kendaraan",v)}/><Input label="No Rangka *" list="rangka-list" value={f.rangka} onChange={(v)=>p.setField("rangka",v)}/><Input label="Tahun *" value={f.tahun} onChange={(v)=>p.setField("tahun",v)}/></div><datalist id="polisi-list">{customers.map((c,i)=><option key={(c.polisi||'')+i} value={c.polisi || ''}>{`${c.customer || ''} - ${c.kendaraan || ''} - ${c.rangka || ''}`}</option>)}</datalist><datalist id="kendaraan-list">{[...new Set(customers.map(c=>c.kendaraan).filter(Boolean))].map((x,i)=><option key={x+i} value={x}/>)}</datalist><datalist id="rangka-list">{customers.map((c,i)=><option key={(c.rangka||'')+i} value={c.rangka || ''}>{`${c.polisi || ''} - ${c.customer || ''} - ${c.kendaraan || ''}`}</option>)}</datalist><h3>👤 Informasi Pelanggan</h3><div style={styles.grid2}><Input label="Nama Pelanggan *" value={f.customer} onChange={(v)=>p.setField("customer",v)}/><Input label="No Telepon" value={f.phone} onChange={(v)=>p.setField("phone",v)}/><Input label="Contact Person" value={f.contact} onChange={(v)=>p.setField("contact",v)}/><Input label="Alamat" value={f.alamat} onChange={(v)=>p.setField("alamat",v)}/></div><h3>▣ Informasi Pembuat Estimasi</h3><div style={styles.grid3}><Input label="Nama Staff *" value={f.staff} onChange={(v)=>p.setField("staff",v)}/><Input label="Jabatan" value={f.jabatan} onChange={(v)=>p.setField("jabatan",v)}/><Input label="Kepala Bengkel" value={f.kepalaBengkel} onChange={(v)=>p.setField("kepalaBengkel",v)}/></div></section>
  <section style={styles.card}><h3>🔧 Estimasi Parts</h3><table style={styles.table}><thead><tr><th>FREE</th><th>PART NO</th><th>PART NAME</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th>ACT</th></tr></thead><tbody>{f.parts.map(r=><tr key={r.id}><td><input type="checkbox" checked={r.free} onChange={(e)=>p.updateRow("parts",r.id,"free",e.target.checked)}/></td><td><input list="part-list" value={r.partNo} onChange={(e)=>p.updateRow("parts",r.id,"partNo",e.target.value)} style={styles.cellInput}/></td><td><input list="part-name-list" value={r.partName} onChange={(e)=>p.updateRow("parts",r.id,"partName",e.target.value)} style={styles.cellInput}/></td><td><input type="number" value={r.qty} onChange={(e)=>p.updateRow("parts",r.id,"qty",e.target.value)} style={styles.smallInput}/></td><td><input value={r.price} onChange={(e)=>p.updateRow("parts",r.id,"price",toNumber(e.target.value))} style={styles.cellInput}/></td><td><b>{rupiah(r.total)}</b></td><td><button onClick={()=>p.deleteRow("parts",r.id)} style={styles.del}>🗑</button></td></tr>)}</tbody></table><datalist id="part-list">{p.partDb.map(x=><option key={x.partNo} value={x.partNo}>{x.partName} - Rp {rupiah(x.price)}</option>)}</datalist><datalist id="part-name-list">{p.partDb.map(x=><option key={x.partNo + x.partName} value={x.partName}>{x.partNo} - Rp {rupiah(x.price)}</option>)}</datalist><button onClick={p.addPart} style={styles.btn}>⊕ Add Part</button><button onClick={()=>p.filePartRef.current.click()} style={styles.green}>♻ Add from Image / Paste Foto</button><input ref={p.filePartRef} type="file" accept="image/*" hidden onChange={(e)=>p.addPartsFromImage(e.target.files[0])}/><small style={{display:"block",marginTop:8}}>Tips: bisa juga copy gambar tabel part lalu klik area aplikasi dan tekan Ctrl+V.</small><hr/>
  <h3>🔨 Estimasi Sublet / Additional Job</h3><EditableSimple rows={f.sublets} type="sublets" updateRow={p.updateRow} deleteRow={p.deleteRow} cols={["subletNo","subletName","qty","price"]}/><button onClick={p.addSublet} style={styles.btn}>⊕ Add Sublet</button><hr/><h3>🧰 Jasa Pekerjaan</h3><div style={styles.flatRateBox}><b>Flat Rate</b><span>Pilih Type</span><select value={p.repairType || "Tidak Ada"} onChange={(e)=>p.handleFlatRateChange(e.target.value)} style={styles.select}>{flatRateOptions.map(x=><option key={x} value={x}>{x}</option>)}</select><span>Flat Rate</span><input readOnly value={rupiah(flatRateList[p.repairType] || 0)} style={styles.flatRateInput}/></div><EditableSimple rows={f.jasa} type="jasa" updateRow={p.updateRow} deleteRow={p.deleteRow} cols={["jasaName","rate","price"]} repairType={p.repairType}/><button onClick={p.addJasa} style={styles.btn}>⊕ Add Jasa</button><div style={styles.discount}><Input label="Disc Part (%)" value={f.discPartPct} onChange={(v)=>p.setField("discPartPct",v)}/><Input label="Disc Part (Rp)" value={f.discPartRp} onChange={(v)=>p.setField("discPartRp",toNumber(v))}/><Input label="Disc Jasa (%)" value={f.discJasaPct} onChange={(v)=>p.setField("discJasaPct",v)}/><Input label="Disc Jasa (Rp)" value={f.discJasaRp} onChange={(v)=>p.setField("discJasaRp",toNumber(v))}/><div style={styles.totalBox}><p>Total Parts<br/><b>Rp {rupiah(p.totals.totalParts)}</b></p><p>Total Sublet<br/><b>Rp {rupiah(p.totals.totalSublet)}</b></p><p>Total Jasa<br/><b>Rp {rupiah(p.totals.totalJasa)}</b></p><b>Grand Total</b><h2>Rp {rupiah(p.totals.grandTotal)}</h2></div></div><div style={styles.actions}><button onClick={p.resetForm} style={styles.red}>↻ Reset</button><button onClick={p.saveMasterFromCurrent} style={styles.btn}>💾 Save Master</button><button onClick={p.saveHistory} style={styles.green}>Submit / Save History</button><button onClick={p.downloadPDF} style={styles.blue}>Submit & Create PDF</button></div></section><PDFView refx={p.pdfRef} form={f} totals={p.totals}/></> }
function EditableSimple({rows,type,updateRow,deleteRow,cols,repairType}){return <table style={styles.table}><tbody>{rows.map(r=><tr key={r.id}>{cols.map(c=>{ const lockedJasaPrice = type === "jasa" && c === "price" && repairType && repairType !== "Tidak Ada"; return <td key={c}><input value={r[c]||""} readOnly={lockedJasaPrice} onChange={(e)=>updateRow(type,r.id,c,c.includes("price")?toNumber(e.target.value):e.target.value)} style={lockedJasaPrice ? {...styles.cellInput, background:"#eee", fontWeight:"bold"} : styles.cellInput} placeholder={c}/></td>})}<td><b>{rupiah(r.total)}</b></td><td><button onClick={()=>deleteRow(type,r.id)} style={styles.del}>🗑</button></td></tr>)}</tbody></table>}
function Input({label,value,onChange,list}){return <label style={styles.label}>{label}<input list={list} value={value||""} onChange={(e)=>onChange(e.target.value)} style={styles.input}/></label>}
function History({history,editHistory,setHistory,newForm}){return <section style={styles.card}><button style={styles.greenRight} onClick={newForm}>+ Buat Estimasi Baru</button><h1>History Estimasi</h1><table style={styles.table}><thead><tr><th>No</th><th>No Polisi</th><th>Pelanggan</th><th>Type</th><th>Grand Total</th><th>Dibuat</th><th>Update</th><th>Action</th></tr></thead><tbody>{history.length===0?<tr><td colSpan="8" style={{textAlign:"center",padding:30}}>Belum ada history.</td></tr>:history.map((h,i)=><tr key={h.id}><td>{i+1}</td><td>{h.polisi}</td><td>{h.customer}</td><td>{h.kendaraan}</td><td>Rp {rupiah(h.grandTotal)}</td><td>{h.createdAt}</td><td>{h.updatedAt}</td><td><button onClick={()=>editHistory(h)} style={styles.btn}>Edit</button><button onClick={()=>editHistory({...h,id:uid(),createdAt:new Date().toLocaleString("id-ID"),updatedAt:new Date().toLocaleString("id-ID")})} style={styles.btn}>Copy</button><button onClick={()=>setHistory(history.filter(x=>x.id!==h.id))} style={styles.del}>Hapus</button></td></tr>)}</tbody></table></section>}
function parseImportRows(text) {
  return String(text || "")
    .split(/\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((x) => x.trim()).filter((_, i, arr) => arr.length > 1 || i === 0));
}

function MasterPart({partDb,setPartDb}){
  const [bulk, setBulk] = useState("");
  const importBulk = () => {
    const rows = parseImportRows(bulk);
    const next = [...partDb];
    rows.forEach((cols) => {
      if (cols.length < 2) return;
      const [partNo, partName, priceRaw] = cols;
      if (/part\s*no/i.test(partNo)) return;
      const data = { partNo, partName, price: toNumber(priceRaw || 0) };
      if (!data.partNo) return;
      const idx = next.findIndex((x) => (x.partNo || "").toUpperCase() === data.partNo.toUpperCase());
      if (idx >= 0) next[idx] = { ...next[idx], ...data }; else next.push(data);
    });
    setPartDb(next);
    setBulk("");
    alert(`${rows.length} baris sparepart diproses.`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(partDb, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "master-sparepart.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <section style={styles.card}><h1>Master Sparepart</h1>
    <p><b>Input banyak sekaligus:</b> copy dari Excel lalu paste di bawah. Format: Part No | Part Name | Price.</p>
    <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={'Contoh dari Excel:\n08880-85986\tTMO 10W-30 SN 1L\t117000\n15601-BZ030\tOIL FILTER\t30000'} style={styles.bulkBox}/>
    <button style={styles.green} onClick={importBulk}>Import Sparepart Banyak</button>
    <button style={styles.btn} onClick={exportJson}>Export Backup</button>
    <button style={styles.btn} onClick={()=>setPartDb([...partDb,{partNo:"",partName:"",price:0}])}>+ Add Sparepart</button>
    <table style={styles.table}><thead><tr><th>Part No</th><th>Part Name</th><th>Price</th><th>Act</th></tr></thead><tbody>{partDb.map((p,i)=><tr key={i}><td><input value={p.partNo} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,partNo:e.target.value}:x))} style={styles.cellInput}/></td><td><input value={p.partName} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,partName:e.target.value}:x))} style={styles.cellInput}/></td><td><input value={p.price} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,price:toNumber(e.target.value)}:x))} style={styles.cellInput}/></td><td><button style={styles.del} onClick={()=>setPartDb(partDb.filter((_,j)=>j!==i))}>Hapus</button></td></tr>)}</tbody></table></section>
}

function MasterCustomer({customerDb,setCustomerDb}){
  const [bulk, setBulk] = useState("");
  const importBulk = () => {
    const rows = parseImportRows(bulk);
    const next = [...customerDb];
    rows.forEach((cols) => {
      if (cols.length < 3) return;
      const [polisi, kendaraan, customer, alamat, rangka, phone] = cols;
      if (/police|polisi/i.test(polisi)) return;
      const data = { polisi, kendaraan, customer, alamat: alamat || "", rangka: rangka || "", phone: phone || "", contact: "", tahun: "" };
      if (!data.polisi) return;
      const key = data.polisi.replace(/\s|-/g, "").toUpperCase();
      const idx = next.findIndex((x) => (x.polisi || "").replace(/\s|-/g, "").toUpperCase() === key);
      if (idx >= 0) next[idx] = { ...next[idx], ...data }; else next.push(data);
    });
    setCustomerDb(next);
    setBulk("");
    alert(`${rows.length} baris customer diproses.`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(customerDb, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "master-customer.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <section style={styles.card}><h1>Master Customer</h1>
    <p><b>Input banyak sekaligus:</b> copy dari Excel lalu paste di bawah. Format: Police No | Model | Customer | Alamat | No Rangka | No Telp.</p>
    <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={'Contoh dari Excel:\nDK-1848-FBT\tRUSH\tWEDA GAMA\tPERUM DALUNG...\tMHK...\t62812...'} style={styles.bulkBox}/>
    <button style={styles.green} onClick={importBulk}>Import Customer Banyak</button>
    <button style={styles.btn} onClick={exportJson}>Export Backup</button>
    <button style={styles.btn} onClick={()=>setCustomerDb([...customerDb,{polisi:"",kendaraan:"",customer:"",alamat:"",rangka:"",phone:""}])}>+ Add Customer</button>
    <table style={styles.table}><thead><tr><th>Police No</th><th>Model</th><th>Customer</th><th>Alamat</th><th>No Rangka</th><th>No Telp</th><th>Act</th></tr></thead><tbody>{customerDb.map((c,i)=><tr key={i}>{["polisi","kendaraan","customer","alamat","rangka","phone"].map(k=><td key={k}><input value={c[k]||""} onChange={e=>setCustomerDb(customerDb.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))} style={styles.cellInput}/></td>)}<td><button style={styles.del} onClick={()=>setCustomerDb(customerDb.filter((_,j)=>j!==i))}>Hapus</button></td></tr>)}</tbody></table></section>
}
function PDFView({refx,form,totals}){
  const tanggal = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const tanggalSingkat = new Date().toLocaleDateString("id-ID");
  const partsChargeable = (form.parts || []).filter((x)=>!x.free);
  const jasaChargeable = (form.jasa || []).filter((x)=>!x.free);
  const subletsChargeable = (form.sublets || []).filter((x)=>!x.free);
  // Diskon jasa hanya berlaku untuk JASA, tidak termasuk SUBLET.
  const totalJasaGabung = totals.totalJasa + totals.totalSublet;
  const totalPartTampil = totals.totalPartsAfterDisc ?? totals.totalParts;
  const totalJasaTampil = totals.totalJasaAfterDisc ?? totals.totalJasa;
  const noEstimasi =
  form.noEstimasi ||
  `EST-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`;

  return <div ref={refx} style={styles.pdfNew}>
    <style>{`.pdfCellTable th,.pdfCellTable td{border:1px solid #222;padding:4px 6px;vertical-align:middle;line-height:1.2}.pdfCellTable th{font-weight:800;text-align:center;background:#edf3e8;font-size:11.2px}.pdfCellTable td{text-align:center}.pdfCellTable .left{text-align:left}`}</style>
    <div style={styles.pdfHeaderBar}>
      <div>
        <h1 style={styles.pdfBranch}>PT. AGUNG AUTOMALL GIANYAR</h1>
        <p style={styles.pdfInfo}>JL. BYPASS DHARMA GIRI, BURUAN, BLAHBATUH, GIANYAR</p>
        <p style={styles.pdfInfo}>TLP : 0361-948888</p>
      </div>
      <div style={styles.pdfLogo}>
        <img src="/logo-agung-toyota.png" alt="Agung Toyota" style={styles.pdfLogoImg} />
      </div>
    </div>

    <div style={styles.pdfBlueTitle}>Estimasi Biaya Service Kendaraan</div>

    <div style={styles.pdfDataGridTop}>
      <div>
        <PdfInfo label="No. Estimasi" value={noEstimasi}/>
        <PdfInfo label="Nama Customer" value={form.customer}/>
        <PdfInfo label="Telepon" value={form.phone}/>
        <PdfInfo label="No. Polisi" value={form.polisi}/>
        <PdfInfo label="No. Rangka" value={form.rangka}/>
      </div>
      <div>
        <PdfInfo label="Tanggal" value={tanggalSingkat}/>
        <PdfInfo label="Contact Person" value={form.contact}/>
        <PdfInfo label="Model Kendaraan" value={form.kendaraan}/>
        <PdfInfo label="VIN" value={form.tahun}/>
        <PdfInfo label="Alamat" value={form.alamat}/>
      </div>
    </div>

    <table className="pdfCellTable" style={styles.pdfTableNew}>
      <colgroup><col style={{width:"7%"}}/><col style={{width:"20%"}}/><col style={{width:"30%"}}/><col style={{width:"8%"}}/><col style={{width:"17%"}}/><col style={{width:"18%"}}/></colgroup>
      <thead><tr><th>No.</th><th>Part No</th><th>Part Name</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>{partsChargeable.length ? partsChargeable.map((r,i)=><tr key={r.id||i}><td>{i+1}</td><td>{r.partNo}</td><td className="left">{r.partName}</td><td>{r.qty}</td><td>Rp {rupiah(r.price)}</td><td>Rp {rupiah(r.total)}</td></tr>) : <tr><td colSpan="6">-</td></tr>}</tbody>
    </table>

    <table className="pdfCellTable" style={styles.pdfTableNew}>
      <colgroup><col style={{width:"8%"}}/><col style={{width:"40%"}}/><col style={{width:"16%"}}/><col style={{width:"18%"}}/><col style={{width:"18%"}}/></colgroup>
      <thead><tr><th>No.</th><th>Sublet</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>{subletsChargeable.length ? subletsChargeable.map((r,i)=><tr key={r.id||i}><td>{i+1}</td><td className="left">{r.subletName}</td><td>{r.qty}</td><td>Rp {rupiah(r.price)}</td><td>Rp {rupiah(r.total)}</td></tr>) : <tr><td colSpan="5">-</td></tr>}</tbody>
    </table>


    <table className="pdfCellTable" style={styles.pdfTableNew}>
      <colgroup><col style={{width:"8%"}}/><col style={{width:"40%"}}/><col style={{width:"16%"}}/><col style={{width:"18%"}}/><col style={{width:"18%"}}/></colgroup>
      <thead><tr><th>No.</th><th>Jasa Pekerjaan</th><th>Rate</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>{jasaChargeable.length ? jasaChargeable.map((r,i)=><tr key={r.id||i}><td>{i+1}</td><td className="left">{r.jasaName}</td><td>{r.rate}</td><td>Rp {rupiah(r.price)}</td><td>Rp {rupiah(r.total)}</td></tr>) : <tr><td colSpan="5">-</td></tr>}</tbody>
    </table>

    <div style={styles.pdfTotalRow}>
      <div style={styles.pdfTotalLine}><b>Total Part</b><span>:</span><b>Rp {rupiah(totalPartTampil)}</b></div>
      <div style={styles.pdfTotalLine}><b>Total Sublet</b><span>:</span><b>Rp {rupiah(totals.totalSublet)}</b></div>
      <div style={styles.pdfTotalLine}><b>Total Jasa</b><span>:</span><b>Rp {rupiah(totalJasaTampil)}</b></div>
    </div>
    <div style={styles.pdfGrand}>Grand Total&nbsp;&nbsp;:&nbsp;&nbsp; Rp {rupiah(totals.grandTotal)}</div>

    <div style={styles.pdfBottom}>
      <div style={styles.pdfNote}>
        <b>Keterangan:</b><br/>
        Harga diatas sudah termasuk PPN. Item Part, Pekerjaan dan Harga diatas tidak mengikat sewaktu-waktu dapat berubah. Setelah disetujui mohon ditanda tangani lalu di whatsapp message ke No. 085739025257 / 085338175251.<br/><br/>
        Untuk memudahkan pendaftaran saat kedatangan servis, silahkan Booking ke Petugas Estimasi atau whatsapp message ke No. 085739025257 / 085338175251.
      </div>
      <div style={styles.pdfSignBox}>Disiapkan Oleh,<br/><br/><br/><b>{form.staff}</b><br/><small>{form.jabatan || "Service Advisor"}</small></div>
      <div style={styles.pdfSignBox}>Disetujui Oleh,<br/><br/><br/><b>{form.kepalaBengkel}</b><br/><small>(Kepala Bengkel)</small></div>
      <div style={styles.pdfSignBox}>Pelanggan,<br/><br/><br/><b>( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</b></div>
    </div>

    <p style={styles.pdfThanks}>Terima kasih atas kepercayaan Anda kepada Agung Toyota Gianyar.</p>
  </div>
}
function PdfInfo({label,value}){return <div style={styles.pdfInfoRow}><b>{label}</b><span>:</span><span>{value || ""}</span></div>}
function PdfTable({rows,cols}){return <table style={styles.pdfTable}><thead><tr><th>No</th>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}><td>{i+1}</td>{cols.map(c=><td key={c}>{["price","total"].includes(c)?"Rp "+rupiah(r[c]):r[c]}</td>)}</tr>):<tr><td colSpan={cols.length+1}>-</td></tr>}</tbody></table>}
const styles={app:{display:"flex",minHeight:"100vh",background:"#f0f0f0",fontFamily:"Arial"},sidebar:{width:260,padding:14,background:"white",borderRight:"1px solid #ccc"},logo:{color:"red",border:"1px solid #408cff",borderRadius:8,fontSize:30,fontWeight:"bold",width:55,padding:8},nav:{padding:12,borderBottom:"1px solid #eee"},navActive:{padding:12,background:"#eef1f5",fontWeight:"bold"},menu:{display:"block",width:"100%",padding:12,background:"white",border:"none",textAlign:"left",cursor:"pointer"},menuOn:{display:"block",width:"100%",padding:12,background:"#0b449d",color:"white",borderRadius:6,textAlign:"left"},main:{flex:1,padding:20},card:{background:"white",border:"1px solid #aaa",borderRadius:8,padding:18,marginBottom:18},tabs:{display:"grid",gridTemplateColumns:"1fr 1fr",textAlign:"center",background:"#ddd",borderRadius:6,overflow:"hidden",marginBottom:15},grid4:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16},grid3:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16},grid2:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16},label:{fontSize:13,fontWeight:"bold"},input:{width:"100%",padding:10,border:"1px solid #bbb",borderRadius:5,marginTop:6,boxSizing:"border-box"},cellInput:{width:"100%",padding:8,border:"1px solid #bbb",borderRadius:5,boxSizing:"border-box"},smallInput:{width:70,padding:8,textAlign:"center",border:"1px solid #bbb",borderRadius:5},table:{width:"100%",borderCollapse:"collapse",marginTop:8},btn:{padding:"9px 14px",border:"1px solid #999",borderRadius:5,background:"white",cursor:"pointer",margin:5},green:{padding:"10px 16px",border:"none",borderRadius:5,background:"#16a34a",color:"white",cursor:"pointer",margin:5},greenRight:{float:"right",padding:"12px 20px",border:"none",borderRadius:6,background:"#16a34a",color:"white",fontWeight:"bold"},blue:{padding:"10px 16px",border:"none",borderRadius:5,background:"#0b45c5",color:"white",cursor:"pointer",margin:5},red:{padding:"10px 16px",border:"none",borderRadius:5,background:"#ef4444",color:"white",cursor:"pointer",margin:5},del:{padding:"7px 10px",border:"none",background:"transparent",color:"red",cursor:"pointer"},discount:{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,alignItems:"end",marginTop:20},actions:{display:"flex",justifyContent:"flex-end",gap:8,marginTop:15},pdf:{width:900,background:"white",padding:40,margin:"30px auto",textAlign:"center"},pdfGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:30,textAlign:"left"},pdfTable:{width:"100%",borderCollapse:"collapse",margin:"10px 0 25px"},sign:{display:"flex",justifyContent:"space-between",marginTop:60},flatRateBox:{display:"grid",gridTemplateColumns:"100px 80px 1fr 80px 140px",gap:10,alignItems:"center",background:"#fffbe6",border:"1px solid #d6c67a",borderRadius:7,padding:10,marginBottom:12},select:{width:"100%",padding:9,border:"1px solid #bbb",borderRadius:5,background:"white"},flatRateInput:{padding:9,border:"1px solid #bbb",borderRadius:5,background:"#eee",textAlign:"right",fontWeight:"bold"},totalBox:{gridColumn:"span 1",textAlign:"right",lineHeight:1.2},bulkBox:{width:"100%",minHeight:110,padding:10,border:"1px solid #aaa",borderRadius:6,boxSizing:"border-box",fontFamily:"Consolas, monospace",marginBottom:10},
pdfNew:{width:820,background:"white",padding:"20px 26px",margin:"30px auto",fontFamily:"Arial",color:"#111",fontSize:10},
pdfHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"},pdfHeaderBar:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"4px 0 12px",textAlign:"left"},
pdfBranch:{fontSize:28,margin:"0 0 6px",fontWeight:"900",letterSpacing:.05,textAlign:"left"},
pdfInfo:{margin:"5px 0",fontSize:16,fontWeight:"800",textAlign:"left"},
pdfLogo:{marginTop:4,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",minWidth:240},pdfLogoImg:{height:75,width:"auto",objectFit:"contain",display:"block"},
pdfLogoHorn:{position:"absolute",left:72,top:-4,width:42,height:16,background:"linear-gradient(135deg,#8a692c 0%,#b8944d 55%,#d0b065 100%)",clipPath:"polygon(0 52%, 100% 0, 78% 32%, 5% 88%)",transform:"rotate(-8deg)",transformOrigin:"left center",display:"block"},
pdfDoubleLine:{borderTop:"4px double #111",margin:"18px 0 26px"},
pdfTitle:{textAlign:"center",fontSize:28,margin:"0 0 26px",fontWeight:"800"},pdfBlueTitle:{background:"#14284a",color:"white",textAlign:"center",fontWeight:"800",fontSize:17,padding:"12px",margin:"10px 0 14px"},
pdfDataGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:35,marginBottom:18},pdfDataGridTop:{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:30,rowGap:0,marginBottom:10,fontSize:12,fontWeight:"800",background:"#f7fbf3",padding:"5px 6px",border:"1px solid #d8e7cf"},
pdfInfoRow:{display:"grid",gridTemplateColumns:"115px 8px 1fr",gap:3,margin:"3px 0",alignItems:"start",textAlign:"left",lineHeight:1.1},
pdfSectionTitle:{textAlign:"center",fontSize:14,margin:"20px 0 8px",fontWeight:"800"},
pdfTableNew:{width:"100%",borderCollapse:"collapse",margin:"7px 0 9px",fontSize:10.2,tableLayout:"fixed"},
pdfTotalRow:{display:"grid",gridTemplateColumns:"1fr",gap:4,borderTop:"2px solid #111",paddingTop:10,marginTop:12,fontSize:12.5,marginLeft:"auto",width:260,textAlign:"right"},
pdfTotalLine:{display:"grid",gridTemplateColumns:"1fr 10px 110px",gap:4,alignItems:"center"},
pdfGrand:{textAlign:"right",fontWeight:"900",fontSize:18,marginTop:10},
pdfDate:{textAlign:"right",fontSize:11,margin:"12px 0"},
pdfBottom:{display:"grid",gridTemplateColumns:"1.55fr 1fr 1fr 1fr",gap:6,marginTop:12},
pdfNote:{border:"1px solid #333",padding:9,textAlign:"left",fontSize:10,lineHeight:1.25,minHeight:86},
pdfSignBox:{border:"1px solid #333",padding:9,textAlign:"center",fontSize:11,minHeight:86},
pdfThanks:{textAlign:"center",fontStyle:"italic",fontWeight:"700",marginTop:24}};