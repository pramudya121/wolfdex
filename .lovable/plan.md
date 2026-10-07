# Audit dan Peningkatan UX Global WolfDex

## Tujuan
Membuat seluruh WolfDex lebih aman, mudah dipahami, konsisten, dan nyaman digunakan tanpa mengubah logika ekonomi atau kontrak. Audit mencakup semua halaman publik, halaman owner/admin, komponen bersama, alur wallet, data on-chain, transaksi, serta tampilan desktop dan ponsel.

## Prioritas 1 — Hilangkan fungsi rusak dan halaman kosong
- Pasang perlindungan error global per halaman agar kegagalan satu komponen tidak menghasilkan layar kosong.
- Perbaiki tombol `Connect Wallet` di Swap, Limit Order, dan Liquidity yang saat ini memanggil aksi kosong; semua memakai satu pembuka wallet yang konsisten.
- Buat format angka aman untuk mencegah `NaN`, `Infinity`, atau nilai `null/undefined` tampil kepada pengguna.
- Samakan penerjemahan error wallet, jaringan, kontrak, allowance, saldo, slippage, cooldown, dan transaksi gagal ke pesan manusiawi.
- Pastikan data lama tetap terlihat saat penyegaran gagal, disertai status “data terakhir diperbarui” dan tombol coba lagi bila relevan.

## Prioritas 2 — Sistem UX bersama
- Buat pola status bersama untuk loading, kosong, error, wallet belum tersambung, jaringan salah, transaksi menunggu tanda tangan, terkirim, berhasil, dan gagal.
- Rapikan hierarki halaman: judul dan ringkasan, aksi utama, metrik, lalu detail; batasi lebar isi agar mudah dipindai.
- Samakan tombol aksi utama, tombol sekunder, input, pilihan, tab, dialog, dan pesan validasi.
- Tingkatkan aksesibilitas: fokus keyboard, label kontrol, dialog yang bisa ditutup dengan Escape, target sentuh, kontras, teks alternatif, dan animasi yang menghormati reduced motion.
- Rapikan navigasi desktop dan ponsel agar halaman utama mudah ditemukan tanpa menu terasa padat.

## Prioritas 3 — Audit dan perbaikan setiap halaman
- **Home:** hanya tampilkan metrik nyata; hapus angka volume/trade perkiraan yang dapat menyesatkan, serta berikan status saat indeks belum siap.
- **Swap & Limit:** validasi input, saldo, likuiditas, rute, dampak harga, minimum diterima, biaya, router terpilih, dan ringkasan transaksi sebelum tanda tangan.
- **Liquidity & Pools:** bedakan pool belum ada, pool kosong, data gagal, dan posisi nol; jelaskan rasio serta hasil tambah/hapus likuiditas.
- **Farming:** lindungi semua kalkulasi reward/APR/share, tampilkan alasan aksi dinonaktifkan, dan buat status stake/harvest jelas.
- **Market & Token Detail:** fallback harga/chart/liquidity yang jujur, stempel waktu pembaruan, retry, serta pencarian/filter yang tetap stabil.
- **Portfolio:** keadaan wallet belum tersambung, saldo nol, posisi kosong, dan riwayat transaksi dengan hash/status/amount yang konsisten.
- **Faucet:** status slot tidak dikonfigurasi, saldo faucet kosong, cooldown, claim pending/berhasil/gagal, dan alat owner yang lebih terstruktur.
- **Domains:** status pencarian, commit–reveal, gas, kepemilikan, records, serta recovery ketika transaksi tertunda.
- **Ecosystem:** validasi upload/logo/link, loading/error/empty state, pencarian/filter, dan aksi owner yang jelas serta aman.
- **Casino & Admin:** validasi saldo/taruhan, status hasil transaksi, guard owner, konfirmasi aksi berisiko, dan kondisi kontrak belum siap.
- **Analytics, Docs, Launchpad:** data kosong versus gagal, sumber data, validasi deploy, progres transaksi, dan tautan langkah berikutnya.

## Protokol QA
- Jalankan pemeriksaan tipe dan build setelah perubahan.
- Buka setiap alamat halaman dengan browser otomatis pada ukuran desktop dan ponsel; catat error console, request gagal, overflow, overlap, dan kontrol yang tidak bisa digunakan.
- Uji keadaan signed-out, wallet tersambung bila sesi tersedia, data kosong, data lambat, RPC gagal, input tidak valid, dan transaksi ditolak pengguna.
- Uji alur utama end-to-end tanpa transaksi dana nyata: connect prompt, quote, approval/confirmation state, filter, pencarian, pagination, modal, dan navigasi balik.
- Transaksi blockchain nyata yang membutuhkan tanda tangan wallet owner akan ditandai sebagai perlu verifikasi owner jika sesi tersebut tidak tersedia.

## Hasil Akhir
- Semua halaman dapat dibuka tanpa blank screen atau error runtime yang diketahui.
- Tidak ada `null`, `undefined`, `NaN`, `Infinity`, atau error RPC mentah yang terlihat.
- Setiap aksi memiliki kondisi siap, loading, sukses, gagal, dan alasan disabled yang jelas.
- Tata letak, kontrol, pesan, dan navigasi konsisten di desktop maupun ponsel.
- Ringkasan QA akhir mencantumkan halaman yang lolos, masalah yang diperbaiki, dan pengujian on-chain yang masih membutuhkan wallet owner.

## Detail Teknis
- Pertahankan TanStack Router, Lovable Cloud, ethers v5, dan kontrak yang ada.
- Gunakan komponen/status bersama dan formatter defensif agar perbaikan berlaku lintas halaman.
- Tidak mengubah alamat kontrak, tokenomics, hak owner, atau aturan transaksi tanpa permintaan terpisah.
- Metadata unik tiap halaman akan dilengkapi sesuai standar aplikasi tanpa mengubah URL publik.