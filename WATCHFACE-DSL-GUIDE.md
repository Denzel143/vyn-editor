# Panduan DSL Watch Face untuk VynWatch

Watch face VynWatch ditulis sebagai deretan perintah gambar berbentuk teks (DSL). Ponsel mengirim satu watch face ke firmware ESP32-S3 lewat BLE, firmware menyimpannya di NVS (hanya satu watch face, yang terakhir diterapkan), lalu menggambarnya ulang pada setiap frame di laman Jam mode Infotainment. DSL ini bukan bahasa pemrograman: tidak ada variabel, kondisi, atau perulangan. Isi layar berubah hanya karena perintah membaca waktu, tanggal, baterai, dan status perangkat saat digambar.

## Membuat paket watch face

Simpan setiap watch face dalam satu folder paket dengan dua file wajib di tingkat root:

```text
face_minimal_01/
|-- record.json
`-- face.dsl
```

Tidak ada `thumbnail.hex`: aplikasi Native dan halaman admin menggambar pratinjau langsung dari DSL. Isi identitas di `record.json` dengan ID unik (maksimum 24 karakter; huruf, angka, `_` dan `-`), nama, kategori `tag`, versi, dan deskripsi. Field `dsl` harus berisi DSL yang sama dengan `face.dsl`. Creator menerima perbedaan line ending, spasi, baris kosong, dan komentar karena keduanya dinormalisasi lebih dulu sebelum dibandingkan. Format record yang disimpan di RTDB:

```json
{
  "id": "face_minimal_01",
  "name": "Minimal Plus",
  "tag": "Digital",
  "version": "1.0.0",
  "description": "Jam besar dengan tanggal lengkap.",
  "dsl": "T,64,14,4,1,11;T,64,50,1,1,13"
}
```

`face.dsl` boleh ditulis multi-baris dan berkomentar agar mudah dibaca:

```text
# Jam besar di atas, tanggal di bawah
T,64,14,4,1,11
T,64,50,1,1,13
```

Buat arsip ZIP dari **isi folder** tersebut sehingga kedua file berada di root ZIP, bukan terbungkus satu folder tambahan. Di [app-store-admin.html](./app-store-admin.html), buka tab **Editor Watch Face**, pilih ZIP tersebut; halaman akan memparse `record.json` dan `face.dsl`, lalu mengisi kolom ID, nama, kategori, versi, deskripsi, dan editor DSL. Periksa hasil verifikasi dan pratinjau, kemudian gunakan satu tombol **Unggah ke Firebase RTDB** untuk mengirim record ke `/watchfaces/{id}`. Tombol **Unduh paket ZIP** membuat paket dari isian yang sudah lolos verifikasi.

RTDB menyimpan record JSON dengan DSL di field `dsl`; ia tidak menyimpan file ZIP biner. Creator memparse ZIP di browser dan mengunggah record hasil parse. Daftar `/apps` untuk aplikasi/game tidak terpengaruh karena watch face memakai node terpisah.

## Alur penggambaran

Firmware mem-parse DSL satu kali saat watch face diterapkan atau saat jam dinyalakan (boot), lalu menggambar seluruh perintah secara berurutan dari kiri ke kanan setiap kali laman Jam di-refresh. Perintah yang muncul belakangan digambar di atas perintah sebelumnya.

```text
T,64,14,4,1,11;T,64,50,1,1,13
```

Layar adalah OLED monokrom 128×64 piksel. Titik asal `(0,0)` ada di pojok kiri atas, `x` bertambah ke kanan, `y` bertambah ke bawah. Gambar yang melewati tepi layar terpotong tanpa error. Warna awal adalah putih (menyala); perintah `X` mengganti warna untuk perintah berikutnya.

## Sintaks dasar

- Satu perintah = satu huruf kapital diikuti parameter, dipisah koma: `T,64,14,4,1,11`.
- Perintah dipisah titik koma `;`. Dalam editor admin, baris baru juga memisahkan perintah dan baris berawalan `#` atau `//` adalah komentar. Saat diunggah, DSL dinormalisasi menjadi satu baris tanpa spasi, tanpa komentar, dan tanpa `;` di akhir.
- Semua parameter adalah bilangan bulat (boleh negatif). Pecahan seperti `2.5` ditolak verifikator.
- Setiap perintah memiliki jumlah parameter tetap (lihat tabel). Parameter yang kurang ditolak verifikator; parameter berlebih diabaikan firmware dan diberi peringatan.
- Huruf perintah harus kapital. Huruf yang tidak dikenal diabaikan diam-diam oleh firmware, tetapi verifikator menandainya sebagai error agar tidak tertinggal.
- Batas: maksimum **72 perintah** dan **1500 byte** DSL setelah dinormalisasi. Melebihi batas ditolak firmware dengan balasan `F|ERR|ukuran`.

Perintah yang tersedia:

| Huruf | Fungsi | Parameter |
|---|---|---|
| `X` | Warna gambar berikutnya | `warna` |
| `T` | Teks dari waktu/tanggal/baterai | `x, y, ukuran, rata, sumber` |
| `L` | Teks tetap | `x, y, ukuran, rata, teks` |
| `C` | Lingkaran | `cx, cy, r, isi` |
| `R` | Kotak (opsional sudut membulat) | `x, y, w, h, isi, radius` |
| `I` | Garis | `x0, y0, x1, y1` |
| `F` | Isian berpola | `x, y, w, h, pola` |
| `K` | Garis penanda di tepi lingkaran | `cx, cy, r, panjang, n` |
| `N` | Angka jam | `cx, cy, r, ukuran, mode` |
| `A` | Jarum analog | `cx, cy, pJam, pMenit, pDetik, tebal` |
| `H` | Jarum analog berupa blok angka | `cx, cy, blokJam, blokMenit, blokDetik, celah` |
| `Q` | Titik yang mengorbit | `cx, cy, r, rTitik, sumber` |
| `P` | Busur progres | `cx, cy, r, sumber` |
| `G` | Bar progres horizontal | `x, y, w, h, sumber` |
| `S` | Ikon status | `x, y, jenis` |
| `Y` | Jam biner | `x, y, sel` |
| `D` | Titik-titik melingkar | `cx, cy, r, n, ukuranTitik` |
| `W` | Baris hari dalam sepekan | `x, y, lebarSel` |

## Warna

| Perintah | Penggunaan |
|---|---|
| `X,warna` | `1` = putih (menyala), `0` = hitam (mematikan piksel). Berlaku untuk semua perintah setelahnya sampai `X` berikutnya. |

Hitam dipakai untuk "melubangi" bentuk yang sudah digambar, misalnya mengosongkan bagian dalam kotak putih:

```text
R,10,10,60,30,1,0;X,0;T,40,20,2,1,0;X,1
```

Ikon baterai `S,x,y,2` selalu putih dan tidak terpengaruh `X`.

## Teks

Font bawaan adalah 5×7 dengan sel 6×8 piksel dan hanya mendukung ASCII cetak (spasi sampai `~`). Lebar teks = jumlah karakter × 6 × `ukuran`, tinggi = 8 × `ukuran`. `y` adalah tepi atas teks.

| Fungsi | Penggunaan |
|---|---|
| `T,x,y,ukuran,rata,sumber` | Menggambar teks yang dihitung dari waktu/tanggal/baterai sesuai tabel sumber di bawah. |
| `L,x,y,ukuran,rata,teks` | Menggambar teks tetap. Maksimal 13 karakter ASCII, tanpa `;` `,` atau `|`. Spasi di ujung teks dipangkas. |

Parameter:

- `ukuran`: skala font 1 sampai 6 (nilai di luar rentang disesuaikan firmware). Ukuran 1 setinggi 8 piksel, ukuran 4 setinggi 32 piksel.
- `rata`: `0` = `x` adalah tepi kiri teks, `1` = `x` adalah titik tengah, `2` = `x` adalah tepi kanan.

Sumber untuk `T`:

| Sumber | Hasil | Contoh |
|---|---|---|
| `0` | Jam:menit | `10:08` |
| `1` | Jam:menit:detik | `10:08:36` |
| `2` | Jam saja | `10` |
| `3` | Menit saja | `08` |
| `4` | Detik saja | `36` |
| `5` | Tanggal angka | `15/11/2026` |
| `6` | Nama hari lengkap (Inggris) | `Wednesday` |
| `7` | Tanggal dan bulan | `15 Nov` |
| `8` | Tanggal saja | `15` |
| `9` | Bulan 3 huruf | `Nov` |
| `10` | Tahun | `2026` |
| `11` | Jam:menit, titik dua berkedip tiap detik | `10:08` / `10 08` |
| `12` | Hari 3 huruf (kapital) | `WED` |
| `13` | Tanggal, bulan, tahun | `15 Nov 2026` |
| `14` | Persen baterai | `76%` |
| `15` | Jam 12-an | `10:08` |
| `16` | AM/PM | `AM` |
| `17` | Tanggal/bulan angka | `15/11` |

Nama hari dan bulan memakai bahasa Inggris seperti di layar jam. Nama hari lengkap bisa sampai 9 karakter (`Wednesday`): pada ukuran 3 lebarnya 162 piksel dan melewati layar, jadi pakai ukuran 1–2 atau sumber `12`. Bila waktu belum disinkronkan dari ponsel, sumber `0`, `11`, dan `15` menampilkan `--:--`, sumber `1` menampilkan `--:--:--`, sumber `14` tetap menampilkan baterai, dan sumber lain menampilkan `--`.

Contoh:

```text
T,64,14,4,1,11;L,64,2,1,1,VYNWATCH;T,64,50,1,1,13
```

## Bentuk dasar

| Fungsi | Penggunaan |
|---|---|
| `C,cx,cy,r,isi` | Lingkaran berpusat di `(cx, cy)` berjari-jari `r`. `isi` = `1` terisi, `0` hanya garis tepi. |
| `R,x,y,w,h,isi,radius` | Persegi panjang dari pojok kiri atas `(x, y)` selebar `w` dan setinggi `h`. `isi` = `1` terisi, `0` garis tepi. `radius` > 0 membulatkan sudut; `0` untuk sudut siku. |
| `I,x0,y0,x1,y1` | Garis dari `(x0, y0)` ke `(x1, y1)`. |
| `F,x,y,w,h,pola` | Mengisi area dengan pola piksel. `pola`: `0` papan catur, `1` titik tiap 4 piksel, `2` garis horizontal selang-seling. |

Contoh:

```text
R,2,2,124,60,0,6;C,64,32,10,1;F,10,50,108,6,0
```

## Jam analog

| Fungsi | Penggunaan |
|---|---|
| `K,cx,cy,r,panjang,n` | Menggambar `n` garis penanda rata di tepi lingkaran berjari-jari `r`, mulai dari posisi jam 12 searah jarum jam. Tiap garis sepanjang `panjang` ke arah pusat. `n` = `60` untuk menit, `12` untuk jam. |
| `N,cx,cy,r,ukuran,mode` | Angka jam pada jari-jari `r` dari pusat. `mode` `0` = hanya 12, 3, 6, 9; `1` = semua angka 1–12. Teks dipusatkan pada titik angka dengan `ukuran` font. |
| `A,cx,cy,pJam,pMenit,pDetik,tebal` | Tiga jarum dari pusat `(cx, cy)`: panjang jarum jam `pJam`, menit `pMenit`, detik `pDetik` (`0` = tanpa jarum detik). `tebal` = `1` membuat jarum jam dan menit setebal 3 piksel; jarum detik selalu tipis. |
| `H,cx,cy,blokJam,blokMenit,blokDetik,celah` | Jarum yang tersusun dari blok angka utuh (misalnya `20`) yang selalu tegak dan horizontal; blok berjajar mengikuti arah jarum. `blokJam/Menit/Detik` adalah jumlah blok per jarum (`0` = tanpa jarum itu), `celah` (0–6) jarak antarblok. Blok yang akan melewati tepi layar tidak digambar. |

Jarum jam bergerak halus: jarum jam ikut maju sesuai menit, jarum menit ikut maju sesuai detik. Saat waktu belum sinkron, jarum menunjuk 12:00:00.

Contoh jam analog klasik:

```text
K,64,30,29,2,60;K,64,30,29,5,12;A,64,30,15,22,26,0;C,64,30,2,1
```

## Indikator dan grafik

| Fungsi | Penggunaan |
|---|---|
| `Q,cx,cy,r,rTitik,sumber` | Titik terisi berjari-jari `rTitik` yang mengorbit lingkaran berjari-jari `r`. `sumber`: `0` detik, `1` menit, `2` jam (siklus 12 jam). |
| `P,cx,cy,r,sumber` | Busur progres setebal 2 piksel dari posisi jam 12 searah jarum jam. `sumber`: `0` detik, `1` menit, `2` hari (00:00–24:00), `3` baterai. |
| `G,x,y,w,h,sumber` | Bar progres horizontal: bingkai `w`×`h` dengan isi sebanding nilai. `sumber` sama dengan `P`. |
| `D,cx,cy,r,n,ukuranTitik` | `n` titik rata melingkar pada jari-jari `r`. `ukuranTitik` ≤ 1 = satu piksel, lebih besar = lingkaran terisi berdiameter `ukuranTitik`. |
| `Y,x,y,sel` | Jam biner BCD enam kolom (JJ MM DD), empat baris per kolom dengan bit tertinggi di atas. `sel` adalah sisi kotak bit menyala; bit mati ditandai dua titik. Lebar total `6×sel + 18`, tinggi `4×sel + 6`. |
| `W,x,y,lebarSel` | Deret huruf hari `M T W T F S S` (Senin sampai Minggu) di `x + k×lebarSel`; hari ini disorot terbalik. Penyorotan hanya aktif jika waktu sudah sinkron. |

Contoh progres:

```text
P,64,30,29,0;P,64,30,26,1;P,64,30,23,2;T,64,14,2,1,2;T,64,32,2,1,3
```

## Ikon status

| Perintah | Hasil |
|---|---|
| `S,x,y,0` | Ikon sinyal WiFi empat batang; `x` tepi kiri, `y` garis dasar batang. Jumlah batang terisi mengikuti kekuatan sinyal; batang kosong digambar garis tepi. |
| `S,x,y,1` | Teks `BT` di `(x, y)`; hanya muncul saat BLE terhubung. |
| `S,x,y,2` | Indikator baterai di posisi tetap pojok kanan atas (x 90–126, y 1–11): persen, ikon baterai, dan lima batang isi. `x` dan `y` diabaikan. Di bawah 20% indikator berkedip. Area itu dikosongkan sebelum digambar. |
| `S,x,y,3` | Ikon amplop 9×7 di `(x, y+1)` dan jumlah notifikasi belum dibaca di kanannya; tidak tergambar bila tidak ada notifikasi. |

Karena `S,x,y,2` memakai posisi tetap, jangan menaruh teks lain di area pojok kanan atas bila ikon itu dipakai.

## Contoh lengkap

Dasbor informasi:

```text
S,2,10,0
S,26,2,1
S,44,2,3
S,0,0,2
T,0,16,3,0,0
T,127,22,2,2,4
T,2,44,1,0,13
G,2,54,60,6,3
T,126,53,1,2,14
```

Jarum angka:

```text
H,64,32,2,3,4,1
```

Tampilan terminal:

```text
L,2,4,1,0,vyn@watch:~$
T,2,16,2,0,1
T,2,38,1,0,13
L,2,48,1,0,bat:
T,32,48,1,0,14
```

## Instalasi ke jam

1. Hubungkan aplikasi Android VynWatch ke jam.
2. Buka tab Beranda, bagian **Watch Face**. Tab **Bawaan** berisi face yang ada di aplikasi; tab **Discover more** mengambil katalog `/watchfaces` dari RTDB (tarik dengan tombol **Muat ulang**). Kedua tab bisa difilter menurut kategori.
3. Tekan **Terapkan** pada watch face pilihan. Instalasi memakai jalur yang sama untuk face bawaan maupun Discover more: Native mengirim `F|B|panjang|nama`, lalu potongan `F|D|no|data` (150 karakter per potongan), lalu `F|E|checksum`.
4. Firmware memeriksa panjang dan checksum, mem-parse DSL, menyimpannya di NVS (kunci `wf`), dan membalas `F|OK|nama`. Face yang sedang dipakai ditandai **Terpasang**; face dari Discover more kembali menampilkan **Terapkan** bila DSL-nya diperbarui di RTDB. Untuk kembali ke tampilan bawaan firmware pilih **Bawaan VynAI**.

Balasan error dari firmware:

| Balasan | Arti |
|---|---|
| `F|ERR|ukuran` | Panjang DSL nol atau melebihi 1500 byte, atau potongan melebihi panjang yang diumumkan. |
| `F|ERR|memori` | Penampung penerimaan gagal dialokasikan. |
| `F|ERR|urutan` | Potongan data tidak berurutan. |
| `F|ERR|rusak` | Panjang atau checksum tidak cocok; kirim ulang. |
| `F|ERR|format` | Tidak ada satu pun perintah valid di DSL; face lama dimuat kembali. |

## Verifikasi di halaman admin

Halaman admin memeriksa langsung di browser: ID, kategori, nama, versi, deskripsi, lalu DSL. Error memblokir tombol unggah; peringatan tidak.

- **Error**: DSL kosong; huruf perintah tidak dikenal atau huruf kecil; parameter kurang atau bukan bilangan bulat; `|nilai|` melebihi 1000; `sumber`, `jenis`, atau `pola` di luar rentang; teks `L` lebih dari 13 karakter, mengandung `,` atau `|`, atau bukan ASCII cetak; lebih dari 72 perintah; DSL lebih dari 1500 byte.
- **Peringatan**: parameter berlebih; `ukuran`, `rata`, atau `isi` di luar rentang (firmware menyesuaikan); gambar terpotong atau seluruhnya di luar layar (diperiksa pada contoh waktu terpanjang, `Wednesday, 30 Sep 2026`, baterai 100%); perintah yang tidak menggambar apa pun; tidak ada perintah yang menampilkan jam; DSL di atas 90% batas.

Pratinjau menggambar tiap piksel dengan algoritma Adafruit_GFX seperti firmware. Anda dapat mengatur jam (berjalan, manual, atau belum sinkron), persen baterai, status BLE, kekuatan WiFi, dan jumlah notifikasi untuk menguji tampilan dalam berbagai keadaan.

## Catatan keamanan dan batasan

- Jangan memasukkan kredensial, token, atau rahasia ke dalam nama, deskripsi, atau teks `L`: record RTDB dapat dibaca aplikasi.
- Sandbox tidak membuat input uploader/database aman secara otomatis. Aturan RTDB menentukan siapa yang dapat membaca dan menulis `/watchfaces`; hindari aturan publik untuk produksi.
- Aplikasi Native menampilkan hanya record yang lolos pemeriksaan ringan (maksimum 72 perintah, 1500 karakter, huruf perintah dikenal, ASCII cetak tanpa `|`), tetapi firmware tetap menjadi penentu akhir.
- Jam hanya menyimpan satu watch face di NVS; menerapkan face baru menggantikan yang lama.
- DSL tidak dapat menggambar gambar bitmap, memakai font lain, atau membaca sensor selain yang tercantum pada sumber teks, progres, dan ikon status.
- Nama yang dikirim ke jam hanya berisi huruf, angka, dan spasi, maksimum 15 karakter; nama panjang di record tetap utuh di katalog.
- Pratinjau di aplikasi Android versi lama masih menampilkan nama hari/bulan dan huruf `W` berbahasa Indonesia, sedangkan layar jam memakai bahasa Inggris. Rujuk pratinjau halaman admin atau layar jam untuk hasil yang sebenarnya.
