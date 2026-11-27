# Panduan Lua untuk Aplikasi VynWatch

Program Apps dan Games yang diunduh dijalankan di firmware ESP32 menggunakan Lua 5.4. Ini Lua yang dibatasi agar sesuai dengan VynWatch, bukan akses Lua penuh ke perangkat. Seluruh akses perangkat melewati Device API berlapis (lihat [Arsitektur tiga lapisan dan Device API](#arsitektur-tiga-lapisan-dan-device-api)). Program dapat menggambar pada layar LCD berwarna (koordinat piksel atau posisi relatif), membaca input perangkat, membaca sensor gerak, baterai, suhu chip, dan waktu, mengontrol LED RGB, membaca tingkat suara mikrofon, meminta pengguna mengetik teks lewat keyboard virtual, mengeluarkan bunyi buzzer, menyimpan state sementara maupun data persisten per aplikasi/game di NVS, dan menangani callback input.

## Membuat paket aplikasi/game

Simpan setiap aplikasi atau game dalam satu folder paket dengan tiga file wajib di tingkat root:

```text
game-tap-snake/
|-- record.json
|-- thumbnail.hex
`-- main.lua
```

Isi identitas di `record.json` dengan ID unik (maksimum 24 karakter; huruf, angka, `_` dan `-`), nama, status `type` (`app` atau `game`), versi, dan deskripsi. Field `thumbnail` harus berisi isi `thumbnail.hex`, sedangkan field `code` harus berisi source `main.lua` yang sama. Creator menerima perbedaan line ending Windows/Unix dan newline di akhir file. Dengan demikian record tetap kompatibel dengan format katalog RTDB:

```json
{
  "id": "game_tap_snake_01",
  "name": "Tap Snake",
  "type": "game",
  "version": "1.0.0",
  "thumbnail": "00000000000000001FF81FF818181818181818181FF81FF80000000000000000",
  "description": "Mini-game skor untuk VynWatch.",
  "code": "function draw()\n  screen.text(4, 18, app.name)\nend"
}
```

`thumbnail.hex` adalah tepat 64 digit hexadecimal (32 byte untuk gambar 16×16, MSB-first per baris). Gambar ini 1-bit (siluet) dan dipakai sebagai cadangan; ikon yang tampil berwarna di jam disimpan terpisah sebagai [ikon berwarna](#ikon-berwarna-aplikasi-dan-game) di baris pertama `main.lua`. `main.lua` berisi source Lua 5.4 dan maksimal 16 KiB UTF-8; program wajib mendefinisikan `draw()`. Saat mengedit program atau ikon, perbarui juga field `code` atau `thumbnail` di `record.json` agar isinya sesuai dengan file terkait. Contoh paket kerja yang dapat dijadikan titik awal berada di folder [app-store-examples/](./app-store-examples/).

Buat arsip ZIP dari **isi folder** tersebut sehingga ketiga file berada di root ZIP, bukan terbungkus satu folder tambahan. Nama ZIP dapat menggunakan ID, misalnya `game_tap_snake_01.zip`. Di [app-store-admin.html](./app-store-admin.html), pilih ZIP tersebut; halaman akan memparse `record.json`, `thumbnail.hex`, dan `main.lua`, lalu mengisi kolom ID, nama, tipe, versi, deskripsi, thumbnail, dan program. Periksa atau edit kolom yang terisi, kemudian gunakan satu tombol **Unggah ke Firebase RTDB** untuk mengirim record ke `/apps/{id}`.

RTDB menyimpan record JSON dengan source di `code`; ia tidak menyimpan file ZIP biner. Creator memparse ZIP di browser dan mengunggah record hasil parse agar aplikasi Native yang sudah ada tetap dapat membaca katalog. ZIP tetap dapat disimpan atau dibagikan terpisah sebagai arsip proyek.

## Ikon berwarna (aplikasi dan game)

Ikon aplikasi dan game di layar LCD jam dapat berwarna: 16×16 piksel dengan palet 16 warna. Ikon berwarna **tidak** memakai field baru; ia disimpan sebagai baris komentar pertama di `main.lua`, sehingga ikut terkirim bersama program tanpa perubahan pada aplikasi Android dan format katalog RTDB:

```lua
--@icon <320 digit hex>
function draw()
  ...
end
```

Format 320 digit hex (huruf besar atau kecil):

| Bagian | Panjang | Isi |
| --- | --- | --- |
| Palet | 64 digit | 16 entri × 4 digit, masing-masing warna RGB565. Entri 0 diabaikan (selalu transparan) |
| Piksel | 256 digit | 1 digit per piksel (indeks palet 0-F), 16 baris × 16 kolom, kiri ke kanan, atas ke bawah |

Aturan:

- Baris `--@icon` harus berada di **baris pertama** file dan diikuti persis 320 digit hex. Bila tidak valid atau tidak ada, jam memakai thumbnail 1-bit (`thumbnail.hex`): putih di atas tile berwarna.
- Ikon berwarna dihitung dalam batas 16 KiB program (±330 byte).
- Piksel berindeks 0 transparan. Pada ikon berwarna, tile ditampilkan dengan latar gelap supaya warna terlihat; pada ikon 1-bit, tile berwarna otomatis.
- `thumbnail.hex` tetap wajib 64 digit. Editor di [app-store-admin.html](./app-store-admin.html) mengisinya otomatis dengan siluet ikon berwarna (piksel berindeks selain 0 = menyala), jadi tidak perlu diisi manual.

Cara membuat paling mudah: buka bagian **Gambar ikon berwarna dengan kuas piksel** di creator. Pilih warna dari palet, gambar di kanvas 16×16 (tersedia ember, cermin, urungkan, dan impor dari gambar yang dikuantisasi ke 15 warna). Baris `--@icon` ditambahkan otomatis saat membuat paket ZIP atau mengunggah ke RTDB dan disembunyikan dari editor kode; saat ZIP atau record dimuat kembali, baris itu dibaca lagi ke kuas. Bila menulis manual di `main.lua`, hasil encoding RGB565 adalah `((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)`, ditulis 4 digit hex.

## Alur program

Firmware menjalankan chunk Lua satu kali ketika aplikasi dibuka. Deklarasikan state di tingkat teratas, implementasikan `draw()` untuk menggambar layar, dan tambahkan callback input bila diperlukan. Firmware memanggil `draw()` pada setiap frame aplikasi; callback input dipanggil saat state input berubah atau menerima langkah. Program harus mendefinisikan `draw()`.

```lua
local count = 0

function draw()
  screen.text(4, 18, app.name)
  screen.line(4, 23, 124, 23)
  screen.text(4, 36, "Count: " .. count)
end

function on_touch(pad, touched)
  if touched then count = count + 1 end
end
```

Callback selain `draw()` opsional. Hindari loop tak berujung dan pekerjaan panjang di callback. Setiap pemanggilan dibatasi sekitar 30.000 instruksi Lua, dan seluruh state interpreter memiliki batas alokasi 48 KiB. Bila program melewati batas atau melempar error, firmware menghentikan aplikasi dan kembali ke menu aplikasinya.

## Bahasa dasar

Lua dasar yang digunakan di contoh:

| Bentuk | Arti |
|---|---|
| `local count = 0` | Membuat variabel lokal program. |
| `count = count + 1` | Mengubah nilai variabel. |
| `if touched then ... end` | Menjalankan blok jika kondisi benar. |
| `function draw() ... end` | Mendefinisikan fungsi callback. |
| `-- komentar` | Komentar satu baris. |
| `..` | Menggabungkan string, misalnya `"Skor: " .. score`. |
| `true` / `false` / `nil` | Boolean dan nilai kosong. |
| `math.max(a, b)` | Fungsi matematika; pustaka `math` tersedia. |

Pustaka standar yang tersedia: `base` (sebagian fungsi berbahaya dibuang), `table`, `string` (tanpa `string.dump`), `math`, dan `utf8`. Fungsi pemuatan kode, file, sistem operasi, package/module, coroutine, debug, dan akses jaringan tidak tersedia. Variabel lokal diinisialisasi ulang saat aplikasi dibuka lagi; gunakan API `storage` untuk data yang perlu bertahan.

Untuk menyesuaikan runtime dengan toolchain ESP32, konfigurasi Lua menggunakan integer 32-bit dan floating-point 32-bit (`LUA_32BITS`). Hindari perhitungan yang mengandalkan integer 64-bit atau presisi `double`.

## Arsitektur tiga lapisan dan Device API

Akses perangkat dipisah menjadi tiga lapisan dengan tanggung jawab yang tidak boleh tercampur:

```text
[3] Aplikasi Lua            hanya memakai Device API: vyn.request(...) atau pembungkus lamanya
        |
[2] Broker Device API       src/vyn_api.cpp + app_lua.cpp
        |                   skema tetap: nama resource, parameter, field, satuan, rentang
        |                   validasi parameter -> panggil provider -> normalisasi hasil -> bentuk envelope
[1] HAL (provider)          chatbox_esp32s3.ino, bagian "PROVIDER HAL"
                            satu-satunya kode yang tahu MPU6050, ADC mikrofon/baterai, pad sentuh, buzzer, LED
```

Aturan yang dijamin firmware:

- Aplikasi **tidak pernah** menerima data mentah sensor. Yang diterima hanya nilai kanonik: nama field, satuan, kerangka sumbu, dan rentang selalu sama.
- Provider HAL **tidak pernah** menyentuh Lua. Ia hanya mengisi nilai sesuai skema; validasi dan format dilakukan broker.
- Mengganti sensor atau board hanya mengubah provider terkait (`vynBind(...)`). Skema, aplikasi Lua, simulator, dan panduan ini tidak berubah, sehingga satu aplikasi berjalan di perangkat keras berbeda.
- Resource yang tidak punya provider di suatu perangkat menghasilkan `error = "unsupported"`; aplikasi bisa memeriksanya lebih dulu dengan `vyn.has(resource)`.

Kategori API:

| Kategori | Isi | Cara akses |
|---|---|---|
| Data hardware (baca) | gerak, baterai, suhu, waktu, tingkat suara, status pad/SW, uptime | `vyn.request` |
| Aktuator (perintah) | LED RGB, buzzer | `vyn.request` dengan params |
| Event input | `on_touch`, `on_sw`, `on_swipe`, `on_encoder`, `on_text`, `on_pointer` | callback (format sudah kanonik) |
| Layanan platform | `storage`, `keyboard.request`, `app.keep_alive`, metadata `app` | tabel masing-masing; bukan data hardware |
| Permukaan gambar | `screen.*` (kanvas warna 320x192; posisi berupa piksel atau ekspresi relatif) | tabel `screen`; ukuran juga ada di `device.info` |

### `vyn.request(resource [, params])`

Satu bentuk request untuk semua data perangkat. Hasilnya selalu tabel envelope yang sama:

```lua
-- sukses
{ ok = true,  resource = "motion.orientation", ts = 123456, data = { pitch = 12.5, yaw = -3.0, roll = 0.4 } }
-- gagal
{ ok = false, resource = "motion.orientation", ts = 123456, error = "not_ready" }
```

| Field | Arti |
|---|---|
| `ok` | `true` bila `data` tersedia. |
| `resource` | Nama resource yang diminta. |
| `ts` | Waktu perangkat saat request dijawab, dalam ms (`millis()`). |
| `data` | Tabel field sesuai skema (hanya bila `ok`). Field, tipe, satuan, dan rentangnya tetap. |
| `error` | Hanya bila gagal: `unsupported`, `not_ready`, `busy`, `bad_param`, `unknown_resource`, atau `error`. |
| `detail` | Penjelasan singkat untuk `bad_param` dan `error`. |

`vyn.request` tidak melempar error Lua untuk kegagalan hardware atau parameter; periksa `ok`. Hanya argumen yang bukan string (nama) atau bukan tabel (params) yang melempar error. Pembungkus lama (`imu.angle()` dan lainnya) tetap berperilaku seperti sebelumnya: mengembalikan `nil` bila belum siap dan melempar error untuk parameter salah.

Fungsi pendukung: `vyn.has(resource)` (boolean, ada provider atau tidak), `vyn.list()` (array nama resource yang didukung perangkat ini), `vyn.version` (versi API, saat ini `1`).

### Daftar resource v1

Resource baca (tanpa parameter kecuali disebut):

| Resource | Field `data` | Satuan dan rentang | Pembungkus lama |
|---|---|---|---|
| `device.info` | `api`, `display_w`, `display_h`, `pads` | integer | - |
| `system.uptime` | `ms` | ms sejak boot | `input.millis()` |
| `system.time` | `weekday` (1=Sen..7=Min), `day`, `month`, `year`, `hour`, `minute`, `second` | integer; `not_ready` bila jam belum sinkron | `device.time()` |
| `system.temperature` | `celsius` | float, -50..200 | `device.temperature()` |
| `power.battery` | `percent` | integer 0..100 | `device.battery()` |
| `motion.orientation` | `pitch`, `yaw`, `roll` | derajat; -90..90, -180..180, -180..180; kerangka layar | `imu.angle()` |
| `motion.accel` | `x`, `y`, `z` | g; kerangka layar (X kanan, Y atas, Z keluar layar), termasuk gravitasi | `imu.accel()` |
| `audio.level` | `level` | integer 0..100, skala relatif; `busy` bila mikrofon dipakai perekam suara | `mic.level()` |
| `input.pad` (param `pad` 1..4, wajib) | `down` | boolean | `input.touch(pad)` |
| `input.switch` | `down` | boolean | `input.sw()` |

Resource perintah (tanpa `data`; sukses = `ok = true`):

| Resource | Params | Keterangan | Pembungkus lama |
|---|---|---|---|
| `indicator.rgb` | `r`, `g`, `b` integer 0..255, atau `auto = true` | Mengambil alih LED dengan warna tetap, atau melepasnya ke ambient. | `rgb.set(r, g, b)`, `rgb.auto()` |
| `audio.tone` | `freq` 100..10000 Hz, `ms` 1..2000 (keduanya wajib) | Dibunyikan lewat buzzer; diabaikan bila sistem dimute. | `sound.buzzer(freq, ms)` |

Contoh:

```lua
function draw()
  local o = vyn.request("motion.orientation")
  if o.ok then
    screen.text(4, 18, string.format("Roll: %d", math.floor(o.data.roll)))
  else
    screen.text(4, 18, "Sensor: " .. o.error)   -- not_ready / unsupported
  end

  if vyn.has("audio.level") then
    local m = vyn.request("audio.level")
    if m.ok then screen.fill_rect(4, 40, math.floor(m.data.level * 120 / 100), 8) end
  end
end

function on_sw(pressed)
  if pressed then vyn.request("indicator.rgb", { r = 255, g = 0, b = 0 }) end
end
```

Menambah resource baru berarti: (1) tambah entri di tabel skema `src/vyn_api.cpp` dan `VynId` di `src/vyn_api.h`, (2) tulis provider di bagian "PROVIDER HAL" lalu `vynBind(...)`, (3) tambahkan definisi yang sama di prelude simulator dan di tabel ini.

## API perangkat

### Layar LCD dan sistem posisi

Area gambar aplikasi adalah **320×192 piksel** berwarna (RGB), di antara dua bar sistem pada layar fisik 320×240. Di atasnya ada bar judul setinggi 24 piksel (nama aplikasi dan tombol tutup), dan di bawahnya ada **bar navigasi kosong setinggi 24 piksel** (setinggi kotak navigasi) yang berisi kotak navigasi sistem; keduanya digambar firmware. Koordinat `(0, 0)` Lua berada tepat di bawah bar judul, dan titik paling bawah adalah `y = 191`. Ini adalah batas resolusi virtual aplikasi: semua yang berada di luar area (termasuk di atas kedua bar) dipotong, dan sentuhan di kedua bar tidak diteruskan ke Lua. Jangan menaruh tombol atau elemen penting di dekat `y = 191` yang membutuhkan area di bawahnya; gunakan `screen.height()` atau ekspresi relatif seperti `"100%-8"` agar tata letak mengikuti tinggi area. Warna berupa bilangan bulat `0xRRGGBB` (lihat `screen.rgb` dan `screen.hsv`); bila argumen warna dihilangkan dipakai warna pena (`screen.color`, default putih di awal tiap frame).

#### Dua cara menentukan posisi dan ukuran

Setiap argumen **posisi atau ukuran** (x, y, lebar, tinggi, radius, ujung garis/segitiga) menerima salah satu dari:

1. **Angka**: piksel absolut seperti biasa. Pecahan dibulatkan ke piksel terdekat (`12.5` menjadi `13`). Nilai dijepit ke -2000..2000.
2. **String ekspresi relatif**: posisi dihitung dari ukuran layar atau elemen lain. Program tetap benar bila ukuran layar berubah.

Kedua bentuk bisa dicampur dalam satu panggilan:

```lua
screen.rect(10, "50%", "100%-20", 30)    -- x absolut, y 50% tinggi, lebar = layar dikurangi 20 px
```

#### Sintaks ekspresi

Ekspresi adalah jumlah atau selisih beberapa **suku**, misalnya `"100%-8"` atau `"50% + @judul.h + 4"`. Spasi boleh dipakai, tanda `+`/`-` di depan suku pertama boleh.

| Suku | Arti |
|---|---|
| `12`, `12.5`, `12px` | Piksel. Sufiks `px` opsional. |
| `50%` | Persen dari panjang sumbu argumen itu: argumen x dan lebar memakai lebar layar (320), argumen y dan tinggi memakai tinggi area (192), radius memakai sisi layar terpendek (192). |
| `50%w`, `50%h` | Memaksa persen dari lebar atau tinggi layar, apa pun posisi argumennya. Berguna untuk tinggi yang sebanding dengan lebar, misalnya kotak persegi: `screen.rect(10, 10, "30%w", "30%w")`. |
| `50%@kartu.w` | Persen dari satu properti elemen lain. |
| `@kartu.right` | Nilai satu properti elemen lain. |

Properti elemen (`@nama.properti`):

| Properti | Isi |
|---|---|
| `left` atau `x` | Tepi kiri. |
| `top` atau `y` | Tepi atas. |
| `right` | Tepi kanan (`x + w`). |
| `bottom` | Tepi bawah (`y + h`). |
| `w` atau `width` | Lebar. |
| `h` atau `height` | Tinggi. |
| `cx`, `cy` | Titik tengah horizontal dan vertikal. |

Elemen yang bisa diacu:

| Nama | Isi |
|---|---|
| `screen` | Seluruh area gambar: `0, 0, 320, 192`. |
| `prev` | Elemen yang **terakhir digambar** pada frame ini (awal frame = seluruh layar). |
| nama buatan | Elemen yang diberi nama lewat `screen.name(...)` atau didaftarkan lewat `screen.mark(...)`. |

Kotak elemen untuk tiap bentuk: `rect`, `fill_rect`, `round_rect`, `fill_round_rect`, dan `gradient` memakai kotaknya sendiri; `text` memakai kotak teks (lebar `huruf × 6 × ukuran`, tinggi `8 × ukuran`); `circle` dan `fill_circle` memakai kotak pembatas (`2r + 1`); `line`, `triangle`, dan `fill_triangle` memakai kotak pembatas titiknya; `pixel` memakai kotak 1×1. Elemen bernama dan `prev` **dimulai ulang tiap frame**, jadi hanya bisa diacu setelah digambar pada frame yang sama (tidak ada acuan ke depan).

Ekspresi yang salah (misalnya `"50%x"`, elemen belum ada, properti tidak dikenal) menghentikan aplikasi dengan pesan runtime error yang menyebut nomor argumennya.

#### Perataan titik acuan: `screen.align`

Secara bawaan `(x, y)` adalah pojok kiri-atas. `screen.align` mengubah arti `(x, y)` menjadi titik acuan lain pada bentuk, sehingga elemen bisa ditengahkan atau dirapatkan ke tepi tanpa menghitung lebarnya:

```lua
screen.align(horizontal [, vertical])
```

| Nilai | Arti |
|---|---|
| `"left"`, `"center"`, `"right"` | Titik acuan horizontal: tepi kiri, tengah, tepi kanan. |
| `"top"`, `"middle"`, `"bottom"` | Titik acuan vertikal: tepi atas, tengah, tepi bawah. |

Kedua argumen boleh ditulis dalam urutan apa saja, dan satu argumen cukup untuk mengubah satu sumbu (sumbu yang tidak disebut tidak berubah), misalnya `screen.align("bottom")`. `screen.align()` tanpa argumen mengembalikan ke `"left"` dan `"top"`. Perataan berlaku untuk `text`, `rect`, `fill_rect`, `round_rect`, `fill_round_rect`, dan `gradient` sampai dipanggil lagi atau frame berakhir (otomatis direset di awal tiap `draw()`). `circle` dan `fill_circle` selalu berpusat di `(x, y)`; `line`, `triangle`, dan `pixel` tidak terpengaruh.

```lua
screen.align("center", "middle")
screen.fill_round_rect("50%", "50%", "60%", "30%", 12, screen.rgb(40, 120, 200))   -- kotak di tengah layar
screen.text("50%", "50%", "OK", screen.rgb(255, 255, 255), 2)                      -- teks tepat di tengah kotak
```

#### Memberi nama dan mengacu elemen

| Fungsi | Penggunaan |
|---|---|
| `screen.name(id)` | Memberi nama pada elemen yang **baru saja digambar** supaya bisa diacu `@id.properti`. |
| `screen.mark(id, x, y, w, h)` | Mendaftarkan sebuah area **tanpa menggambar** (mis. kolom layout). Posisi dan ukuran boleh berupa ekspresi; `screen.align` tidak dipakai. |
| `screen.rel(ekspresi [, sumbu])` | Menghitung ekspresi menjadi bilangan bulat piksel. `sumbu` adalah `"x"` (default), `"y"`, atau `"r"`; menentukan basis `%`. |
| `screen.box(id)` | Menghasilkan empat angka `x, y, w, h` dari `"screen"`, `"prev"`, atau elemen bernama. |
| `screen.text_width(teks [, ukuran])` | Lebar teks dalam piksel (tinggi huruf = `8 × ukuran`). |

Nama berisi 1-12 karakter (huruf, angka, `_`), maksimal 16 nama bersamaan; nama `screen` dan `prev` dicadangkan. Memberi nama yang sama lagi menimpa elemen sebelumnya.

```lua
function draw()
  screen.clear(screen.rgb(10, 12, 24))

  -- Header: lebar penuh dikurangi margin 4% di kiri dan kanan
  screen.fill_round_rect("4%", "3%", "92%", "14%", 8, screen.rgb(30, 60, 140))
  screen.name("header")

  -- Teks di tengah header
  screen.align("center", "middle")
  screen.text("50%", "@header.cy", "DASHBOARD", screen.rgb(255, 255, 255), 2)

  -- Dua kartu berdampingan di bawah header, jarak 4% dari tepi dan antar kartu
  screen.align("left", "top")
  screen.fill_round_rect("4%", "@header.bottom+8", "44%", "50%", 8, screen.rgb(40, 40, 60))
  screen.name("kiri")
  screen.fill_round_rect("@kiri.right+4%", "@kiri.top", "@kiri.w", "@kiri.h", 8, screen.rgb(40, 40, 60))

  -- Status di pojok kanan-bawah, 8 px dari tepi
  screen.align("right", "bottom")
  screen.text("100%-8", "100%-8", "v1.0", screen.rgb(150, 150, 150))
end
```

#### Fungsi gambar

| Fungsi | Penggunaan |
|---|---|
| `screen.text(x, y, teks [, warna [, ukuran]])` | Menulis teks ASCII, maksimal 120 karakter. Font 6×8 piksel dikali `ukuran` 1..4 (default 1). Byte non-ASCII diabaikan. |
| `screen.line(x1, y1, x2, y2 [, warna])` | Menggambar garis. |
| `screen.pixel(x, y [, warna])` | Menggambar satu piksel. |
| `screen.rect(x, y, w, h [, warna])` | Persegi panjang tanpa isi (diabaikan bila `w` atau `h` ≤ 0). |
| `screen.fill_rect(x, y, w, h [, warna])` | Persegi panjang terisi. |
| `screen.round_rect(x, y, w, h, r [, warna])` | Persegi panjang bersudut membulat tanpa isi; `r` dibatasi setengah sisi terpendek. |
| `screen.fill_round_rect(x, y, w, h, r [, warna])` | Versi terisi. |
| `screen.circle(x, y, r [, warna])` | Lingkaran tanpa isi; `(x, y)` adalah pusat. |
| `screen.fill_circle(x, y, r [, warna])` | Lingkaran terisi. |
| `screen.triangle(x1, y1, x2, y2, x3, y3 [, warna])` | Segitiga tanpa isi. |
| `screen.fill_triangle(x1, y1, x2, y2, x3, y3 [, warna])` | Segitiga terisi. |
| `screen.gradient(x, y, w, h, warna1, warna2 [, vertikal])` | Gradasi linear dari `warna1` ke `warna2`; vertikal (atas ke bawah) bila `vertikal` dihilangkan atau `true`, horizontal bila `false`. |
| `screen.clear([warna])` | Mengisi seluruh area (default hitam). |
| `screen.color(warna)` | Menetapkan warna pena. |
| `screen.rgb(r, g, b)` | Menghasilkan warna dari komponen 0..255. |
| `screen.hsv(h, s, v)` | Menghasilkan warna dari `h` 0..359, `s` dan `v` 0..100. |
| `screen.width()` | Menghasilkan `320`. |
| `screen.height()` | Menghasilkan `192`. |

Argumen warna adalah bilangan bulat `0xRRGGBB` dan bukan posisi, jadi tidak menerima ekspresi. Radius `r` pada `round_rect` dan `circle` menerima ekspresi (persen dihitung dari sisi layar terpendek); ukuran huruf `ukuran` tetap bilangan bulat 1..4.

Contoh koordinat absolut (tetap berlaku dan tidak berubah):

```lua
screen.rect(8, 24, 112, 28)
screen.fill_circle(64, 38, 5)
screen.text(14, 58, "Halo", screen.rgb(255, 220, 90), 2)
```

Kapan memakai yang mana: koordinat absolut cocok untuk gambar piksel yang presisi (sprite, grid permainan, tata letak tetap). Posisi relatif cocok untuk antarmuka (header, kartu, tombol, teks tengah, status di sudut) karena tata letaknya mengikuti ukuran layar dan elemen di sekitarnya, dan tidak perlu menghitung ulang bila Anda mengubah satu ukuran.

Tidak ada buffer gambar pribadi atau akses piksel arbitrer dari Lua.

### Input

| Fungsi | Hasil |
|---|---|
| `input.touch(pad)` | Status sentuh pad, dengan `pad` bernilai 1 sampai 4. |
| `input.sw()` | `true` selama sakelar SW rotary encoder tertekan. |
| `input.millis()` | Waktu perangkat dalam milidetik (`millis()` Arduino). |

Callback input bersifat opsional:

| Callback | Argumen | Perilaku |
|---|---|---|
| `on_touch(pad, touched)` | Nomor pad 1–4 dan boolean | Dipanggil saat status stabil setiap pad berubah, baik saat disentuh maupun dilepas. Ini bukan callback klik, klik ganda, atau tahan. |
| `on_sw(pressed)` | Boolean | Dipanggil saat SW ditekan (`true`) dan dilepas (`false`) selama aplikasi masih berjalan. Menahan SW tidak lagi keluar dari aplikasi: tahan SW bebas dipakai aplikasi (lihat di bawah untuk pewaktuan klik dan tahan). Jika aplikasi keluar saat SW masih ditekan, callback release dikirim lebih dulu. |
| `on_swipe(direction)` | `"left"` atau `"right"` | Dipanggil saat firmware mendeteksi gesture swipe yang valid. Gesture turun dipetakan ke `"right"` dan gesture naik ke `"left"` oleh pemetaan pad firmware. |
| `on_encoder(step)` | Integer `+1` atau `-1` | Dipanggil sekali untuk setiap langkah encoder. Putaran cepat dikirim sebagai beberapa callback langkah, bukan satu delta besar. |
| `on_pointer(state, x, y)` | `"down"`/`"move"`/`"up"` dan koordinat | Sentuhan layar mentah; lihat [Layar sentuh](#layar-sentuh-koordinat-jari). |
| `on_text(text, submitted)` | String dan boolean | Hasil `keyboard.request()`: dipanggil sekali setelah pengguna menutup keyboard virtual. Lihat bagian [Keyboard virtual](#keyboard-virtual-input-teks). |

Callback input tidak menerima klik tunggal/ganda atau event hold. Touch callback melaporkan transisi kontak yang sudah distabilkan, sehingga satu gerakan swipe dapat memicu transisi sentuh dan callback swipe. Tahan SW bebas dipakai aplikasi dan tidak lagi mengeluarkan aplikasi. Firmware menunggu ±500 ms setelah SW ditekan untuk membedakan screenshot, sehingga klik singkat dikirim sebagai `on_sw(true)` lalu `on_sw(false)` berurutan saat SW dilepas, sedangkan SW yang ditahan ≥ 500 ms mengirim `on_sw(true)` pada saat itu dan `on_sw(false)` saat dilepas. Aplikasi dapat mengukur lama tahan dari selisih waktu kedua callback (misalnya dengan penghitung frame di `draw()`).

Pintasan sistem yang tetap dimiliki firmware pada SW dan encoder: SW ditahan sambil memutar encoder zig-zag = screenshot. Selama penentuan itu (SW ditekan kurang dari ±500 ms) putaran encoder tidak dikirim sebagai `on_encoder`; setelah SW ditahan ≥ 500 ms putaran kembali menjadi `on_encoder`. Keluar dari aplikasi dilakukan dengan mengetuk tombol x di kanan bar judul (24 px teratas), yang membuka dialog Suspend/Close.

GPIO3 dan GPIO7 memakai margin 1,35× hanya pada ambang yang berasal dari span sentuhan terkonfirmasi. Lantai tap dan swipe dari MAD/noise peak dibatasi masing-masing 400 dan 240 hitungan agar derau RF tidak menaikkan ambang tanpa batas sebelum sentuhan pertama. Pulsa swipe pada kedua pad harus bertahan minimal 14 ms dan sentuhan stabil minimal 120 ms. Nilai ini kompromi perangkat lunak; kabel touch yang panjang dan berdekatan dengan MT3608/RF tetap dapat memerlukan perbaikan routing atau shielding.

Jika sentuhan tetap tidak terbaca, aktifkan `TOUCH_DEBUG` di sketch sementara dan periksa baseline, MAD, noise peak, span, serta ambang tiap pad melalui Serial saat radio dan MT3608 berada pada kondisi operasional. Pastikan kalibrasi berlangsung saat semua pad tidak disentuh. Ambang disetel khususnya pada `touchPadTapFloor()` dan parameter `TOUCH_*` di sketch; jangan menaikkan ambang global berdasarkan ghost touch satu pad.

Contoh membaca status saat menggambar:

```lua
function draw()
  screen.text(4, 24, input.touch(1) and "PAD 1 DOWN" or "PAD 1 UP")
  screen.text(4, 40, input.sw() and "SW DOWN" or "SW UP")
end
```

### Layar sentuh (koordinat jari)

Aplikasi dapat menerima koordinat jari di layar LCD. Ada dua cara, dan memakai salah satunya sudah cukup untuk mengaktifkan **mode pointer**:

| Cara | Penggunaan |
|---|---|
| `on_pointer(state, x, y)` | Callback event. Cukup mendefinisikan fungsi ini agar mode pointer aktif. |
| `input.pointer()` | Polling di `draw()`. Menghasilkan tiga nilai `down, x, y`, atau `nil` bila layar sentuh tidak ada. Memanggilnya menyalakan mode pointer selama ±1,5 detik sejak panggilan terakhir. |

Argumen `on_pointer`:

| Argumen | Isi |
|---|---|
| `state` | `"down"` saat jari menyentuh, `"move"` saat posisinya berubah, `"up"` saat jari diangkat. |
| `x`, `y` | Koordinat piksel di **area aplikasi**: `x` 0..319, `y` 0..191. Titik `(0, 0)` berada tepat di bawah bar judul sistem, sama dengan koordinat `screen.*`. Pada `"up"` yang dikirim adalah posisi terakhir jari. |

Di mode pointer, layar **tidak lagi berperan sebagai SW dan pad touch**: ketuk tidak menjadi klik SW, tahan tidak menjadi tahan SW, seret vertikal tidak menjadi `on_encoder`, dan usap horizontal tidak menjadi `on_swipe`. Seluruh sentuhan di area aplikasi dikirim apa adanya sebagai koordinat dan status tekan. Hal yang tetap dimiliki sistem:

- Bar judul (24 px teratas): mengetuk tombol x di kanan membuka dialog Suspend/Close.
- Pad touch fisik, tombol SW fisik, dan encoder fisik tetap mengirim `on_touch`, `on_sw`, `on_swipe`, dan `on_encoder` seperti biasa.
- Handle navigasi sistem dan keyboard virtual tetap menang atas aplikasi.

Aplikasi yang tidak memakai `on_pointer` maupun `input.pointer()` berperilaku seperti sebelumnya (ketuk = SW, seret = encoder, usap = swipe).

`"move"` hanya dikirim bila koordinat berubah dibanding event sebelumnya.

Contoh menggambar titik di bawah jari dan tombol yang bisa ditekan, dengan hit-test memakai posisi relatif:

```lua
local px, py, down = 0, 0, false
local pressed = 0

function draw()
  screen.clear(screen.rgb(10, 12, 24))

  -- Tombol di tengah; kotaknya diberi nama agar bisa dipakai untuk hit-test
  screen.align("center", "middle")
  screen.fill_round_rect("50%", "50%", "40%", "20%", 10, screen.rgb(40, 120, 200))
  screen.name("tombol")
  local bx, by, bw, bh = screen.box("tombol")
  screen.text("50%", "50%", "Ditekan: " .. pressed, screen.rgb(255, 255, 255))

  if down then
    screen.fill_circle(px, py, 6, screen.rgb(255, 220, 90))
    if px >= bx and px < bx + bw and py >= by and py < by + bh then
      screen.align("center", "top")
      screen.text("50%", "@tombol.bottom+8", "di dalam tombol", screen.rgb(120, 255, 160))
    end
  end
end

function on_pointer(state, x, y)
  px, py = x, y
  down = state ~= "up"
  if state == "down" then pressed = pressed + 1 end
end
```

Polling tanpa callback:

```lua
function draw()
  local down, x, y = input.pointer()
  if down then screen.fill_circle(x, y, 5) end
end
```

### Buzzer

```lua
sound.buzzer(frequency_hz, duration_ms)
```

- Frekuensi yang diizinkan: 100–10.000 Hz.
- Durasi yang diizinkan: 1–2.000 ms.
- Perintah diabaikan saat buzzer dimute pada sistem.

Contoh: `sound.buzzer(2200, 50)`.

### Sensor gerak (IMU)

> `imu.*`, `device.*`, `rgb.*`, `mic.*`, `sound.buzzer`, dan `input.touch/sw/millis` adalah pembungkus tipis di atas `vyn.request` (tabel resource di atas). Data, satuan, dan rentangnya identik.

Nilai berasal dari resource `motion.*`; pada perangkat ini sumbernya MPU6050 yang sudah difilter firmware (filter Kalman), tetapi aplikasi hanya melihat nilai kanonik. Hanya nilai sudut dan percepatan yang tersedia; tidak ada data mentah gyro atau log.

| Fungsi | Hasil |
|---|---|
| `imu.angle()` | Tiga angka `x, y, z`: sudut dalam derajat. |
| `imu.accel()` | Tiga angka `x, y, z`: percepatan dalam g. |

Kedua fungsi menghasilkan `nil` bila sensor belum siap. Sensor dibangunkan otomatis pada panggilan pertama dan butuh sekitar 0,2 detik sebelum nilainya tersedia, jadi periksa `nil` terutama di awal program. Sensor akan tidur lagi sendiri bila program berhenti memanggilnya.

Sumbu mengikuti layar: **X** = kanan layar, **Y** = atas layar, **Z** = keluar layar (ke arah pengguna). Posisi acuan 0° adalah perangkat tegak.

| Sudut | Arti |
|---|---|
| `x` (pitch) | -90 sampai 90. `+90` bila layar menghadap ke atas, `-90` bila menghadap ke bawah. |
| `y` (yaw) | -180 sampai 180. Relatif terhadap posisi saat sensor bangun dan hanyut pelan; bukan arah kompas. |
| `z` (roll) | -180 sampai 180. `0` tegak, positif bila sisi kanan layar terangkat. Tidak stabil saat perangkat rebah rata (layar menghadap atas/bawah). |

Percepatan termasuk gravitasi: perangkat diam dan tegak menghasilkan sekitar `x=0, y=1, z=0`.

```lua
function draw()
  local ax, ay, az = imu.accel()
  local px, py, pz = imu.angle()
  if ax then
    screen.text(4, 18, string.format("Roll: %d", math.floor(pz)))
    screen.text(4, 30, string.format("Acc Y: %.2f g", ay))
  else
    screen.text(4, 18, "Sensor belum siap")
  end
end
```

### Baterai, suhu, dan waktu

| Fungsi | Hasil |
|---|---|
| `device.battery()` | Persentase baterai, bilangan bulat 0–100. |
| `device.temperature()` | Suhu chip ESP32-S3 dalam °C (angka pecahan). |
| `device.time()` | Tabel waktu lokal, atau `nil` bila jam belum sinkron. |

Field tabel `device.time()`:

| Field | Isi |
|---|---|
| `weekday` | Hari dalam minggu: 1 = Senin sampai 7 = Minggu. |
| `day` | Tanggal (1–31). |
| `month` | Bulan (1–12). |
| `year` | Tahun, misalnya `2026`. |
| `hour` | Jam (0–23). |
| `minute` | Menit (0–59). |
| `second` | Detik (0–59). |

```lua
local days = {"Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"}

function draw()
  local t = device.time()
  if t then
    screen.text(4, 18, days[t.weekday] .. " " .. t.day .. "/" .. t.month .. "/" .. t.year)
    screen.text(4, 30, string.format("%02d:%02d:%02d", t.hour, t.minute, t.second))
  end
  screen.text(4, 44, "Baterai: " .. device.battery() .. "%")
  screen.text(4, 54, string.format("Suhu: %.1f C", device.temperature()))
end
```

### LED RGB

LED RGB onboard normalnya berputar warna sendiri (ambient). Program tidak perlu memanggil apa pun untuk itu. Program hanya perlu mengambil alih bila ingin mengatur warnanya sendiri.

| Fungsi | Perilaku |
|---|---|
| `rgb.set(r, g, b)` | Mengambil alih LED dengan warna tetap. Setiap komponen bilangan bulat 0–255. `rgb.set(0, 0, 0)` mematikan LED. |
| `rgb.auto()` | Melepas kontrol dan mengembalikan LED ke ambient normal. |

Kontrol dilepas otomatis saat program berhenti atau keluar ke menu. Warna dikalikan batas kecerahan firmware, jadi 255 tidak berarti kecerahan LED penuh. Nilai di luar 0–255 menghasilkan runtime error. Pemanggilan `rgb.set` tidak perlu diulang tiap frame; cukup saat warna berubah.

```lua
local alert = false

function on_touch(pad, touched)
  if not touched then return end
  alert = not alert
  if alert then rgb.set(255, 0, 0) else rgb.auto() end
end
```

### Mikrofon

| Fungsi | Hasil |
|---|---|
| `mic.level()` | Tingkat suara saat ini, bilangan bulat 0 (sunyi) sampai 100 (keras). |

Hanya tingkat kenyaringan relatif yang tersedia. Program tidak dapat merekam atau membaca data audio. Fungsi ini menghasilkan `nil` bila mikrofon sedang dipakai perekam suara sistem. Pengukuran memakan sekitar 5 ms dan hasilnya disimpan 50 ms, jadi aman dipanggil tiap frame di `draw()`. Nilai 100 adalah skala relatif, bukan satuan desibel.

```lua
function draw()
  local level = mic.level() or 0
  screen.text(4, 18, "Suara: " .. level)
  screen.rect(4, 30, 120, 10)
  screen.fill_rect(4, 30, math.floor(level * 120 / 100), 10)
end
```

### Keyboard virtual (input teks)

Program dapat meminta pengguna mengetik teks lewat keyboard virtual perangkat (carousel karakter yang sama dengan chat). Program tidak menggambar atau mengendalikan keyboard; ia hanya meminta teks dan menerima hasilnya di callback `on_text`.

```lua
keyboard.request(prompt [, initial [, max_len]])
```

| Argumen | Isi |
|---|---|
| `prompt` | String petunjuk yang tampil di kolom teks selama kolom masih kosong. ASCII cetak, maksimal 15 karakter (sisanya dipotong). |
| `initial` | Opsional. Isi awal kolom teks (default kosong). Dipotong sesuai `max_len`. |
| `max_len` | Opsional. Panjang teks maksimum, bilangan bulat 1–100 (default 32). Di luar rentang ini menghasilkan runtime error. |

`keyboard.request` **tidak memblokir** dan menghasilkan `true` bila permintaan diterima, atau `false` bila ditolak karena permintaan sebelumnya masih terbuka. Keyboard dibuka firmware segera setelah callback yang memanggilnya selesai. Hasilnya datang lewat callback:

| Callback | Perilaku |
|---|---|
| `on_text(text, submitted)` | `submitted = true` dan `text` berisi teks bila pengguna menekan ikon kirim (teks boleh kosong). `submitted = false` dan `text = ""` bila pengguna membatalkan lewat ikon tutup. Dipanggil tepat sekali per permintaan yang diterima. |

Selama keyboard terbuka, `draw()` dan callback input (`on_touch`, `on_sw`, `on_swipe`, `on_encoder`) dijeda, lalu berlanjut setelah `on_text` dipanggil. Program tetap berjalan dan state-nya tidak hilang. Keyboard hanya mendukung ASCII; karakter lain diabaikan. Tombol mikrofon di keyboard (speech-to-text) hanya aktif bila Wi-Fi terhubung, dan hasilnya tetap masuk ke kolom teks. Jika program dihentikan, dihapus, atau layar berpindah ke laman lain selagi keyboard terbuka, permintaan dibatalkan dan `on_text` tidak dipanggil. Di dalam `on_text` program boleh langsung memanggil `keyboard.request` lagi.

**Memanggil dari tombol SW.** Bila `keyboard.request` dipanggil saat SW sedang ditekan (misalnya di `on_sw(true)`), firmware menunggu SW dilepas dulu. Keyboard baru terbuka setelah SW dilepas, baik pada klik singkat maupun pada SW yang ditahan. Bila penekanan itu ternyata dipakai sebagai screenshot, permintaan dibuang dan `on_text("", false)` dipanggil. Bila dipanggil dari `on_sw(false)`, `draw()`, atau callback lain, keyboard terbuka segera.

Karena permintaan dibuka setelah callback selesai, jangan mengandalkan `keyboard.request` di tingkat teratas chunk saat aplikasi pertama kali dimuat; panggil dari `draw()` atau callback input, atau gunakan flag seperti pada contoh.

```lua
local name = storage.get("name") or "(kosong)"
local asked = false

function draw()
  screen.text(4, 18, "Nama:")
  screen.text(4, 30, name)
  screen.text(4, 50, "Klik SW: ganti nama")
end

function on_sw(pressed)
  if pressed and not asked then
    asked = keyboard.request("Nama", name ~= "(kosong)" and name or "", 16)
  end
end

function on_text(text, submitted)
  asked = false
  if submitted and #text > 0 then
    name = text
    storage.set("name", name)
  end
end
```

### Metadata dan kontrol aplikasi

Tabel `app` hanya-baca dari sisi program melalui API publik yang disediakan:

| Field | Isi |
|---|---|
| `app.id` | ID katalog aplikasi. |
| `app.name` | Nama aplikasi. |
| `app.keep_alive()` | Fungsi tanpa argumen untuk mencegah aplikasi ditutup otomatis saat idle (lihat di bawah). |

Aplikasi dan game yang dibiarkan tanpa input (sentuhan, tombol, atau encoder) selama sekitar 2 menit ditutup otomatis oleh firmware dan kembali ke menu. Program yang memang perlu tetap berjalan tanpa input, misalnya jam, monitor sensor, atau permainan yang berjalan sendiri, memanggil `app.keep_alive()` agar waktu idle dihitung ulang dari nol. Selama dipanggil berkala, layar juga tidak masuk mode standby. Panggil seperlunya, misalnya di `draw()` saat program masih aktif; berhenti memanggilnya berarti aplikasi kembali tunduk pada timeout idle.

```lua
function draw()
  app.keep_alive()
  local t = device.time()
  if t then
    screen.text(4, 30, string.format("%02d:%02d:%02d", t.hour, t.minute, t.second))
  end
end
```

Contoh: `screen.text(4, 18, app.name)`.

### Penyimpanan NVS per aplikasi/game

Tabel `storage` menyimpan nilai di NVS pada namespace khusus milik ID aplikasi/game yang sedang berjalan. Data tidak dibagi dengan program lain dan otomatis dihapus saat aplikasi/game dihapus dari perangkat. Namespace juga mencatat ID pemilik untuk mencegah benturan hash ID mengakses atau menghapus data program lain.

| Fungsi | Perilaku |
|---|---|
| `storage.get(key)` | Menghasilkan nilai tersimpan, atau `nil` jika key belum ada. |
| `storage.set(key, value)` | Menyimpan string, angka, atau boolean dan menghasilkan `true` jika berhasil. |
| `storage.remove(key)` | Menghapus satu key dan menghasilkan `true` jika ada, `false` jika tidak ada. |

Key harus berisi 1–15 byte dan tidak boleh menggunakan key internal `__owner`. Nilai string dibatasi 1.023 byte dan tidak boleh mengandung byte NUL; angka harus finite. Key/value yang tidak valid, benturan ID, atau kegagalan NVS menghasilkan runtime error Lua dan aplikasi dihentikan oleh firmware. Tulis hanya saat nilai berubah, bukan setiap frame, untuk mengurangi penulisan flash.

```lua
local bestScore = storage.get("best_score") or 0

function draw()
  screen.text(4, 18, "Best: " .. bestScore)
end

function on_encoder(step)
  bestScore = math.max(0, bestScore + step)
  storage.set("best_score", bestScore)
end
```

Nilai yang disimpan mempertahankan tipe string, angka integer/pecahan, atau boolean. `storage.remove(key)` menghapus satu nilai; menghapus aplikasi/game dari perangkat menghapus seluruh namespace program tersebut.

## Contoh interaksi

### Counter dengan touch, SW, swipe, dan encoder

```lua
local count = 0

function draw()
  screen.text(4, 18, "INPUT COUNTER")
  screen.line(4, 23, 124, 23)
  screen.text(4, 36, "Count: " .. count)
  screen.text(4, 52, "Swipe kiri: kurang")
end

function on_touch(pad, touched)
  if touched then count = count + 1 end
end

function on_sw(pressed)
  if pressed then count = count + 1 end
end

function on_swipe(direction)
  if direction == "right" then
    count = count + 1
  else
    count = math.max(0, count - 1)
  end
end

function on_encoder(step)
  count = math.max(0, count + step)
end
```

Untuk contoh lebih lengkap, lihat folder [app-store-examples/](./app-store-examples/). Setiap contoh berisi `main.lua`, record JSON untuk RTDB, dan ikon/thumbnail.

## Record katalog Firebase

Lua disimpan sebagai string UTF-8 pada field `code`, sedangkan record tetap memakai bentuk:

```json
{
  "id": "app_counter_01",
  "name": "Input Counter",
  "type": "app",
  "version": "1.0.0",
  "thumbnail": "00003C7EFFFFFFFFFFFFFFFF7E3C0000",
  "description": "Contoh input perangkat.",
  "code": "local count = 0\n\nfunction draw()\n  screen.text(4, 18, \"Count: \" .. count)\nend\n\nfunction on_encoder(step)\n  count = count + step\nend"
}
```

Di JSON, baris baru dalam `code` di-escape sebagai `\n`; pada Lua source, itu adalah baris baru sungguhan. Jangan mengisi field `code` dengan objek JSON DSL. Batas source adalah 16 KiB UTF-8. Program akan divalidasi dengan interpreter firmware sebelum disimpan.

Thumbnail OLED berukuran 16×16 piksel, monokrom, MSB-first. Representasi hex-nya harus tepat 64 digit (32 byte).

## Membuat dan mengunggah program

1. Salin salah satu folder di [app-store-examples/](./app-store-examples/) dan edit `main.lua`. Pertahankan `draw()` dan callback dengan nama/argumen sesuai panduan ini.
2. Ubah `code` di `record.json` agar source-nya sama dengan `main.lua`; pastikan `thumbnail.hex` sesuai dengan field `thumbnail`.
3. Buka [app-store-admin.html](./app-store-admin.html) dari local web server dan pilih ZIP lengkap. Setelah ZIP diparse, periksa seluruh kolom yang terisi (termasuk dropdown `app/game`), lalu tekan satu tombol **Unggah ke Firebase RTDB**. ZIP dibatasi 2 MiB dan source Lua 16 KiB UTF-8.
4. Hubungkan perangkat ke Android app dan unduh aplikasi. Native tetap menjadi perantara katalog dan BLE; ia tidak mengeksekusi Lua atau perlu perubahan untuk format program ini.
5. Firmware menerima source melalui BLE, memvalidasinya sebagai Lua text, menyimpannya di SPIFFS, lalu menjalankan interpreter saat aplikasi dibuka. Source invalid ditolak. Saat runtime terjadi error/batas terlampaui, aplikasi dihentikan dan UI kembali ke menu terkait. Partisi board harus menyertakan SPIFFS. Firmware memformat partisi SPIFFS bila mount gagal; proses ini menghapus semua file di partisi tersebut. Data aplikasi lama pada LittleFS tidak dipindahkan otomatis dan harus diunduh kembali.

## Catatan keamanan dan batasan

- Jangan pernah memasukkan kredensial, token, atau rahasia dalam source program.
- Sandbox tidak membuat input uploader/database aman secara otomatis. Aturan RTDB menentukan siapa yang dapat membaca dan menulis; hindari aturan publik untuk produksi.
- Source program dibatasi 16 KiB, alokasi interpreter 48 KiB, dan callback/initialization Lua masing-masing dibatasi sekitar 30.000 instruksi.
- Satu-satunya jalur ke hardware adalah Device API (`vyn.request` dan pembungkusnya) serta kanvas `screen`. Operasi hardware terbatas ke layar, status input, permintaan teks lewat keyboard virtual (`keyboard.request`), buzzer, LED RGB, serta pembacaan sensor gerak, baterai, suhu chip, waktu, dan tingkat suara mikrofon (pembacaan semuanya hanya-baca; tidak ada rekaman audio). Program tidak dapat mengakses Wi-Fi, BLE langsung, filesystem, proses lain, atau GPIO arbitrer.
- Memory exhaustion atau runtime error mengakhiri aplikasi. Gunakan state lokal kecil dan render layar di `draw()` alih-alih menjalankan loop.
