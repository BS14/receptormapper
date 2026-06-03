# ReceptorMapper — Manual QC Test Cases

Paste each SMILES and target sequence directly into the UI at **http://localhost:3000**.  
Automated equivalent: `python3 tests/qc_tests.py`

---

## QC-01 — Erlotinib / EGFR · Lung panel

| | |
|---|---|
| **Drug** | Erlotinib (FDA-approved EGFR TKI) |
| **Panel** | Lung |
| **SMILES** | `C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1` |

**Target sequence (EGFR):**
```
MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITY
VQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMR
NLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEEN
CQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQ
```

**What to check:**
- [ ] Binding strength: **moderate** or **strong**
- [ ] Drug-like: **Yes**
- [ ] Ro5 violations: **0 or 1**
- [ ] MW < 500
- [ ] Cell line panel shows **12 lung lines**

---

## QC-02 — Paracetamol / EGFR · Pan-cancer panel

| | |
|---|---|
| **Drug** | Paracetamol (analgesic, non-oncology) |
| **Panel** | Pan-cancer |
| **SMILES** | `CC(=O)Nc1ccc(O)cc1` |

*(Same EGFR target sequence as QC-01)*

**What to check:**
- [ ] Binding strength: **weak**
- [ ] Drug-like: **Yes**
- [ ] Ro5 violations: **0**
- [ ] MW shown ≈ **151**
- [ ] Cell line panel shows **20 pan-cancer lines**

---

## QC-03 — Imatinib / ABL1 · Leukemia panel

| | |
|---|---|
| **Drug** | Imatinib (BCR-ABL inhibitor, CML) |
| **Panel** | Leukemia / Hematological |
| **SMILES** | `Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1` |

**Target sequence (ABL1):**
```
MGPGVTPNPATSSEPRGFSLNGYMNPQAQLPQANPQNFAPPPQTDMSNQQSFATPSGNGHILPQLQL
QHQQQQPQHPQQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQ
MQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQ
```

**What to check:**
- [ ] Binding strength: **moderate** or **strong**
- [ ] Drug-like: **Yes**
- [ ] Cell line panel shows **12 lines**
- [ ] **K562** appears in the cell line table

---

## QC-04 — Vemurafenib / BRAF · Melanoma panel

| | |
|---|---|
| **Drug** | Vemurafenib (BRAF V600E inhibitor) |
| **Panel** | Melanoma |
| **SMILES** | `CCCS(=O)(=O)Nc1ccc(F)c(C(=O)c2c[nH]c3ncc(-c4ccc(Cl)cc4)cc23)c1` |

**Target sequence (BRAF):**
```
MAAAAAGATVKSRWSGSHQFEQLSGSILWMATPGQRPLVRLLDQRFPRDEKFPQGMADELYGR
EPNQAVSGPAVVHLEQHPRYGQVLKIIFAITMSGNTYWFVTQHGANALPLFDLPAEQFSESM
EILPWFAHNRTITLWQLYQSLKTVNQLKKLVNQHIINLHQDLMKLNEEGFSLSQNLNQYMRD
MAAEGPKFLRQVSKHIYNAYLHSLTQQLIEEFPQIASAIQFASQEHSSTVMLAHNLFNQMQHQ
```

**What to check:**
- [ ] Drug-like: **Yes**
- [ ] Cell line panel shows **10 lines**
- [ ] **A375** (BRAF-mutant melanoma) appears in the table

---

## QC-05 — Cisapride / EGFR · Pan-cancer (pipeline smoke test)

| | |
|---|---|
| **Drug** | Cisapride (withdrawn GI drug — hERG blocker) |
| **Panel** | Pan-cancer |
| **SMILES** | `CCOC(=O)c1cc2cc(OC)c(OC)cc2[nH]1` |

*(Same EGFR target sequence as QC-01)*

**What to check:**
- [ ] Results page loads without error
- [ ] All four panels render (Binding, Off-Target, Cell Line, ADMET)
- [ ] No 500 error or blank page

---

## QC-06 — Aspirin / COX-2 · Pan-cancer

| | |
|---|---|
| **Drug** | Aspirin (NSAID, COX-1/2 inhibitor) |
| **Panel** | Pan-cancer |
| **SMILES** | `CC(=O)Oc1ccccc1C(=O)O` |

**Target sequence (COX-2):**
```
MLARALLLCAVLALSHTANPCCSHPCQNRGVCMSVGFDQYKCDCTRTGFYGENCTTPEFLTR
IKLFLKPTPNTVHYILTHFKGFWNVVNNIPFLRNAIMSYVLTSRSHLIDSPPTYNADYGYKSWEA
FSNLSYYTRALPPVPDDCPTPLGVKGKKQLPDSNEIVEKLLLRRKFIPDPQGTNLMFAFFAQH
FTHQFFKTDHKRGPAFTNGLGHGVNMHREAFEDLVLNKDLRPPSGEETLQITISFDLNLIQYTK
```

**What to check:**
- [ ] Drug-like: **Yes**
- [ ] Ro5 violations: **0**
- [ ] MW shown ≈ **180**
- [ ] Off-target table has **52 rows**

---

## QC-07 — Selegiline / MAO-B · Neurological panel

| | |
|---|---|
| **Drug** | Selegiline (MAO-B inhibitor, Parkinson's) |
| **Panel** | Neurological |
| **SMILES** | `C#CCN(C)Cc1ccccc1` |

**Target sequence (MAO-B):**
```
MSNKCDVVVVGGGISGMACAKRAVEHDGSFEVNHLVDKVTGLPTPGVVNLVAKLAPGQGGLLL
EAWLGSAHREHVLHRESGYFSPEALPDPEDPAMRYLAESAFGGNATVLYVPQVMLSPTHIHTR
LQHEAFPHGARLKHYGRGLSHLKPLEEIFESQNRQIKETLRSILDAPYAQWVHEQYGIPQQEF
RFHSSKELLLVLGGQSFPGFNFPANSTPVHITDKNSAEEFQTHIINKLTKTYRHLLETQK
```

**What to check:**
- [ ] Drug-like: **Yes**
- [ ] MW shown ≈ **187**
- [ ] Cell line panel shows **10 lines**
- [ ] **SH-SY5Y** (dopaminergic neuron model) appears in the table

---

## QC-08 — Sitagliptin / DPP-4 · Diabetic panel

| | |
|---|---|
| **Drug** | Sitagliptin (DPP-4 inhibitor, type 2 diabetes) |
| **Panel** | Diabetic / Metabolic |
| **SMILES** | `Fc1cc(c(F)cc1F)CC(N)CC(=O)N2CCn3c(nnc3C(F)(F)F)C2` |

**Target sequence (DPP-4):**
```
MKTPWKVLLGLLGAAALVTIITVPVVLLNKGTDDATADSQQKTRELYPTNASLNGTEGRLDPSKS
NSSQVSPTAENGLPAPTVSATPVSKQLQSIMKNLQSILDPVQKKLEEMLQNQNLQLQGISRKNT
NHFLNCTGQVQQDVKEIVNLNSSMDKLTLPRSAQNSSTSEGSKPPKPKSEFQTISDPLNLSNLNE
TLNMPNRQPAGFLMQAQQALYQKQQVQIPTELGQALQQSTLHQDAQVSQTLRQQVSQNLQLSQS
```

**What to check:**
- [ ] Drug-like: **Yes**
- [ ] Cell line panel shows **10 lines**
- [ ] **MIN6** (pancreatic beta-cell) appears in the table
- [ ] **HepG2** (liver insulin resistance) appears in the table

---

## QC-09 — Metformin / AMPK · Diabetic panel

| | |
|---|---|
| **Drug** | Metformin (biguanide, first-line T2D drug) |
| **Panel** | Diabetic / Metabolic |
| **SMILES** | `CN(C)C(=N)NC(=N)N` |

**Target sequence (AMPK α):**
```
MEFNELEAQIQNLQTIQRGREKIILGSSRDLTDDLQRALDQIKQTRSPIPEMRQEDYAELKDKLMQ
EQRQELEQLQKEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQM
```

**What to check:**
- [ ] Binding strength: **weak** (Metformin is not a direct tight binder)
- [ ] Drug-like: **Yes**
- [ ] MW shown ≈ **129**
- [ ] Ro5 violations: **0**
- [ ] **HepG2** appears in the cell line table

---

## QC-10 — Erythromycin · Pan-cancer (Ro5 violator)

| | |
|---|---|
| **Drug** | Erythromycin (macrolide antibiotic, MW 733) |
| **Panel** | Pan-cancer |
| **SMILES** | `CCC1C(C(C(C(=O)C(CC(C(C(C(C(C(=O)O1)C)OC2CC(CC(O2)C)N(C)C)C)OC3C(C(CC(O3)C)O)OC)(C)O)C)C)C)O` |

*(Same EGFR target sequence as QC-01)*

**What to check:**
- [ ] Drug-like: **No** (large macrolide)
- [ ] MW shown > **500**
- [ ] Ro5 violations: **≥ 2**
- [ ] **Druglikeness flag** appears in the flags section (orange/yellow banner)

---

## QC-11 — Atorvastatin / HMGCR · Liver panel

| | |
|---|---|
| **Drug** | Atorvastatin (statin, MW 558) |
| **Panel** | Liver / HCC |
| **SMILES** | `CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O` |

**Target sequence (HMGCR):**
```
MLSRAALVTCRAGLLRLLTAQELAAAPANQHTKANLMTAASRTLDKEALKHFQELQKMQLQHQAQQLQE
RQQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQ
```

**What to check:**
- [ ] MW shown > **500**
- [ ] Ro5 violations: **≥ 1** (MW > 500)
- [ ] Cell line panel shows **10 liver lines**
- [ ] **HepG2** and **Hep3B** appear in the table

---

## QC-12 — Cache round-trip (Paracetamol / EGFR / Lung)

| | |
|---|---|
| **Drug** | Paracetamol |
| **Panel** | Lung |
| **SMILES** | `CC(=O)Nc1ccc(O)cc1` |

*(Same EGFR target sequence as QC-01)*

**What to check:**
- [ ] Submit once → note the pIC50 value
- [ ] Submit the **identical** SMILES + sequence again
- [ ] Second result returns **instantly** (cache hit, no Lambda invocation)
- [ ] pIC50 is **exactly the same** as the first run

---

## Quick-reference summary

| ID | Drug | Target | Panel | Key check |
|---|---|---|---|---|
| QC-01 | Erlotinib | EGFR | Lung | Moderate/strong · drug-like |
| QC-02 | Paracetamol | EGFR | Pan-cancer | Weak · MW 151 · 0 violations |
| QC-03 | Imatinib | ABL1 | Leukemia | Moderate/strong · K562 present |
| QC-04 | Vemurafenib | BRAF | Melanoma | Drug-like · A375 present |
| QC-05 | Cisapride | EGFR | Pan-cancer | Pipeline completes, no crash |
| QC-06 | Aspirin | COX-2 | Pan-cancer | MW 180 · 0 violations · 52 off-targets |
| QC-07 | Selegiline | MAO-B | Neurological | Drug-like · SH-SY5Y present |
| QC-08 | Sitagliptin | DPP-4 | Diabetic | Drug-like · MIN6 present |
| QC-09 | Metformin | AMPK | Diabetic | Weak · MW 129 · HepG2 present |
| QC-10 | Erythromycin | EGFR | Pan-cancer | **Not** drug-like · ≥2 violations · flag |
| QC-11 | Atorvastatin | HMGCR | Liver | MW > 500 · ≥1 violation · HepG2 |
| QC-12 | Paracetamol | EGFR | Lung | Cache hit on second submit |
