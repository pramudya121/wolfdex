# wolfdex

Buatlah sebuah decentralized exchange (DEX) bernama WOLFDEX yang berjalan nyata di jaringan LitVM LiteForge Testnet  — tanpa simulasi. Semua smart contract harus ditulis, diuji, dan dideploy ke testnet; seluruh frontend harus menggunakan panggilan on-chain.

UX harus “lovable”: ramah, elegan, animasi lembut, dan identitas kuat dan premium  (SERIGALA).

Halaman Wajib (SPA React)

Swap

Liquidity (add/remove)

Pools

Analytics

Portfolio

Wallet Support

MetaMask

OKX Wallet

Rabby Wallet

Bitget Wallet

Design / Visual

Background: abstrak bergelombang seperti ombak atau gelombang  merah + hitam + warna emas , modern, smooth wave/parallax

Logo: SERIGALA dengan kepala tegak dan keren dengan tatapan tajam dan buatkan premium logo nya , bold–geometric, warna utama merah/hitam

Typography: Inter atau modern sans serupa

Technical Requirements Smart Contracts

Implementasi AMM lengkap (Factory, Router, Pair, ERC20 helper)

Unit + integration tests

Deploy ke WOLFDEX (alamat final wajib dicantumkan)

Frontend

React + Ethers.js atau Wagmi + ethers

ENV untuk ABI & address

Semua aksi (swap, add/remove, create pair) harus on-chain, tampilkan tx info

Analytics / Indexing

Subgraph (The Graph) atau fallback on-chain RPC event indexing

CI/CD

Deploy contract otomatis (Hardhat/Foundry)

Deploy frontend otomatis (Netlify/Vercel)

Security

Reentrancy guard

Input validation

Gas optimization

Timelocks admin (opsional)

Deliverables

Repo frontend + backend deploy scripts

Smart contracts + tests

Deployed contract addresses (LitVM LiteForge Testnet)

URL frontend live

Design assets (logo, bg animation, style guide)

README lengkap

Acceptance Criteria

User benar-benar dapat swap token di  LitVM LiteForge Testnet melalui WOLFDEX

User dapat add/remove liquidity + melihat posisi

Semua wallet terdukung dapat connect & transact

📌 Bagian Tambahan (Permintaan Kamu): “Bangunlah Yang Lebih Penting Hingga Akhir”

Tambahkan prinsip ini ke seluruh proses development:

⚡ Build Priority Philosophy — “Bangunlah Yang Lebih Penting Hingga Akhir”

Proyek harus disusun berdasarkan prioritas paling penting terlebih dahulu dan diselesaikan sampai ujung tanpa setengah-setengah. Urutan prioritas wajib:

Core Infrastructure (PALING PENTING)

Factory

Router

Pair contract

ERC20 token

Deployment + verifikasi

Tests lengkap

Core Functions

Swap (fungsi utama yang harus berjalan 100% stabil)

Add/remove liquidity

Pool creation

Essential Frontend Integration

Wallet connect

On-chain tx flow

Real testnet responses

Analytics + Indexing

Subgraph

Harga / TVL / volume

UX Polish

Animasi

Desain

Responsiveness

Finalization Phase (Ending Phase)

Security review

CI/CD finalize

Documentation lengkap

Release live yang stable

Intinya: semua bagian penting harus dibangun dulu dan diselesaikan 100% sampai akhir, tanpa ada fitur yang setengah matang

utama kan pembangunan nya dari yang penting dulu dan semua contract wajib di implentasikan ke frontend dan di integrasikan ke blockchain dan bangun semua halaman nya dengan yang sangat keren dan  modern dengan fitur yang sangat lengkap  dan buatkan semua nya premium dan animasi nya juga premium dan buatkan  fitur WRAP/UNWRAP di formulir  swap jadi saat   coin zkLTC mau melakukan  swap ke token wzkLTC tulisan di tombol nya WRAP dan  saat  token wzkLTC  mau melakukan swap kle coin zkLTC tulisan  di tombol nya UNWRAP dan saat ke token lain tulisan nya SWAP   dan penempatan fitur nya sangat rapih dan teratur

tolong tambahkan contract UniswapV2Factory ini dia: 0x5687FDA3BdE14d38057699c402606ab470EcA873

dan ini ABI nya : 

[

	{

		"constant": false,

		"inputs": [

			{

				"internalType": "address",

				"name": "tokenA",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "tokenB",

				"type": "address"

			}

		],

		"name": "createPair",

		"outputs": [

			{

				"internalType": "address",

				"name": "pair",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "_feeToSetter",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "constructor"

	},

	{

		"anonymous": false,

		"inputs": [

			{

				"indexed": true,

				"internalType": "address",

				"name": "token0",

				"type": "address"

			},

			{

				"indexed": true,

				"internalType": "address",

				"name": "token1",

				"type": "address"

			},

			{

				"indexed": false,

				"internalType": "address",

				"name": "pair",

				"type": "address"

			},

			{

				"indexed": false,

				"internalType": "uint256",

				"name": "",

				"type": "uint256"

			}

		],

		"name": "PairCreated",

		"type": "event"

	},

	{

		"constant": false,

		"inputs": [

			{

				"internalType": "address",

				"name": "_feeTo",

				"type": "address"

			}

		],

		"name": "setFeeTo",

		"outputs": [],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"constant": false,

		"inputs": [

			{

				"internalType": "address",

				"name": "_feeToSetter",

				"type": "address"

			}

		],

		"name": "setFeeToSetter",

		"outputs": [],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [

			{

				"internalType": "uint256",

				"name": "",

				"type": "uint256"

			}

		],

		"name": "allPairs",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "allPairsLength",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "",

				"type": "uint256"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "feeTo",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "feeToSetter",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"name": "getPair",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "INIT_CODE_PAIR_HASH",

		"outputs": [

			{

				"internalType": "bytes32",

				"name": "",

				"type": "bytes32"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	}

]

tolong tambahkan contract WETH9 ini dia: 0x4Fd3765cde8D1d2BE4EdbaA03940AfC56794c304

dan ini ABI nya :

[

	{

		"constant": false,

		"inputs": [

			{

				"name": "guy",

				"type": "address"

			},

			{

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "approve",

		"outputs": [

			{

				"name": "",

				"type": "bool"

			}

		],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"constant": false,

		"inputs": [],

		"name": "deposit",

		"outputs": [],

		"payable": true,

		"stateMutability": "payable",

		"type": "function"

	},

	{

		"constant": false,

		"inputs": [

			{

				"name": "dst",

				"type": "address"

			},

			{

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "transfer",

		"outputs": [

			{

				"name": "",

				"type": "bool"

			}

		],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"constant": false,

		"inputs": [

			{

				"name": "src",

				"type": "address"

			},

			{

				"name": "dst",

				"type": "address"

			},

			{

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "transferFrom",

		"outputs": [

			{

				"name": "",

				"type": "bool"

			}

		],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"constant": false,

		"inputs": [

			{

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "withdraw",

		"outputs": [],

		"payable": false,

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"payable": true,

		"stateMutability": "payable",

		"type": "fallback"

	},

	{

		"anonymous": false,

		"inputs": [

			{

				"indexed": true,

				"name": "src",

				"type": "address"

			},

			{

				"indexed": true,

				"name": "guy",

				"type": "address"

			},

			{

				"indexed": false,

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "Approval",

		"type": "event"

	},

	{

		"anonymous": false,

		"inputs": [

			{

				"indexed": true,

				"name": "src",

				"type": "address"

			},

			{

				"indexed": true,

				"name": "dst",

				"type": "address"

			},

			{

				"indexed": false,

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "Transfer",

		"type": "event"

	},

	{

		"anonymous": false,

		"inputs": [

			{

				"indexed": true,

				"name": "dst",

				"type": "address"

			},

			{

				"indexed": false,

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "Deposit",

		"type": "event"

	},

	{

		"anonymous": false,

		"inputs": [

			{

				"indexed": true,

				"name": "src",

				"type": "address"

			},

			{

				"indexed": false,

				"name": "wad",

				"type": "uint256"

			}

		],

		"name": "Withdrawal",

		"type": "event"

	},

	{

		"constant": true,

		"inputs": [

			{

				"name": "",

				"type": "address"

			},

			{

				"name": "",

				"type": "address"

			}

		],

		"name": "allowance",

		"outputs": [

			{

				"name": "",

				"type": "uint256"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [

			{

				"name": "",

				"type": "address"

			}

		],

		"name": "balanceOf",

		"outputs": [

			{

				"name": "",

				"type": "uint256"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "decimals",

		"outputs": [

			{

				"name": "",

				"type": "uint8"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "name",

		"outputs": [

			{

				"name": "",

				"type": "string"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "symbol",

		"outputs": [

			{

				"name": "",

				"type": "string"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	},

	{

		"constant": true,

		"inputs": [],

		"name": "totalSupply",

		"outputs": [

			{

				"name": "",

				"type": "uint256"

			}

		],

		"payable": false,

		"stateMutability": "view",

		"type": "function"

	}

]

dan tolong tambahkan contract UniswapV2Router02 ini dia: 0xd28967D75750f477E450Df81C73f34E2713B86B4

dan ini ABI nya :

[

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "tokenA",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "tokenB",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "amountADesired",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountBDesired",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountAMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountBMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "addLiquidity",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountA",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountB",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "token",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenDesired",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETHMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "addLiquidityETH",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountToken",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETH",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			}

		],

		"stateMutability": "payable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "tokenA",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "tokenB",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountAMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountBMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "removeLiquidity",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountA",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountB",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "token",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETHMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "removeLiquidityETH",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountToken",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETH",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "token",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETHMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "removeLiquidityETHSupportingFeeOnTransferTokens",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountETH",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "token",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETHMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			},

			{

				"internalType": "bool",

				"name": "approveMax",

				"type": "bool"

			},

			{

				"internalType": "uint8",

				"name": "v",

				"type": "uint8"

			},

			{

				"internalType": "bytes32",

				"name": "r",

				"type": "bytes32"

			},

			{

				"internalType": "bytes32",

				"name": "s",

				"type": "bytes32"

			}

		],

		"name": "removeLiquidityETHWithPermit",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountToken",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETH",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "token",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountTokenMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountETHMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			},

			{

				"internalType": "bool",

				"name": "approveMax",

				"type": "bool"

			},

			{

				"internalType": "uint8",

				"name": "v",

				"type": "uint8"

			},

			{

				"internalType": "bytes32",

				"name": "r",

				"type": "bytes32"

			},

			{

				"internalType": "bytes32",

				"name": "s",

				"type": "bytes32"

			}

		],

		"name": "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountETH",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "tokenA",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "tokenB",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "liquidity",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountAMin",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountBMin",

				"type": "uint256"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			},

			{

				"internalType": "bool",

				"name": "approveMax",

				"type": "bool"

			},

			{

				"internalType": "uint8",

				"name": "v",

				"type": "uint8"

			},

			{

				"internalType": "bytes32",

				"name": "r",

				"type": "bytes32"

			},

			{

				"internalType": "bytes32",

				"name": "s",

				"type": "bytes32"

			}

		],

		"name": "removeLiquidityWithPermit",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountA",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountB",

				"type": "uint256"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapETHForExactTokens",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "payable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactETHForTokens",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "payable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactETHForTokensSupportingFeeOnTransferTokens",

		"outputs": [],

		"stateMutability": "payable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactTokensForETH",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactTokensForETHSupportingFeeOnTransferTokens",

		"outputs": [],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactTokensForTokens",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountOutMin",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapExactTokensForTokensSupportingFeeOnTransferTokens",

		"outputs": [],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountInMax",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapTokensForExactETH",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "amountInMax",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			},

			{

				"internalType": "address",

				"name": "to",

				"type": "address"

			},

			{

				"internalType": "uint256",

				"name": "deadline",

				"type": "uint256"

			}

		],

		"name": "swapTokensForExactTokens",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "_factory",

				"type": "address"

			},

			{

				"internalType": "address",

				"name": "_WETH",

				"type": "address"

			}

		],

		"stateMutability": "nonpayable",

		"type": "constructor"

	},

	{

		"stateMutability": "payable",

		"type": "receive"

	},

	{

		"inputs": [],

		"name": "factory",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveOut",

				"type": "uint256"

			}

		],

		"name": "getAmountIn",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			}

		],

		"stateMutability": "pure",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveIn",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveOut",

				"type": "uint256"

			}

		],

		"name": "getAmountOut",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			}

		],

		"stateMutability": "pure",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountOut",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			}

		],

		"name": "getAmountsIn",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountIn",

				"type": "uint256"

			},

			{

				"internalType": "address[]",

				"name": "path",

				"type": "address[]"

			}

		],

		"name": "getAmountsOut",

		"outputs": [

			{

				"internalType": "uint256[]",

				"name": "amounts",

				"type": "uint256[]"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "amountA",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveA",

				"type": "uint256"

			},

			{

				"internalType": "uint256",

				"name": "reserveB",

				"type": "uint256"

			}

		],

		"name": "quote",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "amountB",

				"type": "uint256"

			}

		],

		"stateMutability": "pure",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "WETH",

		"outputs": [

			{

				"internalType": "address",

				"name": "",

				"type": "address"

			}

		],

		"stateMutability": "view",

		"type": "function"

	}

]

dan tolong tambahkan contract UniswapV2Library ini dia: 0x084724341e07F50782E1c3923D9a6Fb7ce993816

dan ini ABI nya :

[]

dan tolong tambahkan contract Multicall ini dia: 0xEc94943b75359f1ede3d639AD548e56239d754c2

dan ini ABI nya :

[

	{

		"inputs": [

			{

				"components": [

					{

						"internalType": "address",

						"name": "target",

						"type": "address"

					},

					{

						"internalType": "bytes",

						"name": "callData",

						"type": "bytes"

					}

				],

				"internalType": "struct Multicall.Call[]",

				"name": "calls",

				"type": "tuple[]"

			}

		],

		"name": "aggregate",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "blockNumber",

				"type": "uint256"

			},

			{

				"internalType": "bytes[]",

				"name": "returnData",

				"type": "bytes[]"

			}

		],

		"stateMutability": "nonpayable",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "uint256",

				"name": "blockNumber",

				"type": "uint256"

			}

		],

		"name": "getBlockHash",

		"outputs": [

			{

				"internalType": "bytes32",

				"name": "blockHash",

				"type": "bytes32"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "getCurrentBlockCoinbase",

		"outputs": [

			{

				"internalType": "address",

				"name": "coinbase",

				"type": "address"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "getCurrentBlockDifficulty",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "difficulty",

				"type": "uint256"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "getCurrentBlockGasLimit",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "gaslimit",

				"type": "uint256"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "getCurrentBlockTimestamp",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "timestamp",

				"type": "uint256"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [

			{

				"internalType": "address",

				"name": "addr",

				"type": "address"

			}

		],

		"name": "getEthBalance",

		"outputs": [

			{

				"internalType": "uint256",

				"name": "balance",

				"type": "uint256"

			}

		],

		"stateMutability": "view",

		"type": "function"

	},

	{

		"inputs": [],

		"name": "getLastBlockHash",

		"outputs": [

			{

				"internalType": "bytes32",

				"name": "blockHash",

				"type": "bytes32"

			}

		],

		"stateMutability": "view",

		"type": "function"

	}

]

dan tambahkan  RPC LitVM LiteForge Testnet ini dia:

nama network : LitVM LiteForge

urlrpc : https://liteforge.rpc.caldera.xyz/http

ID CHAIN: 4441

syimbol: zkLTC

URL block Explorer: https://liteforge.explorer.caldera.xyz

tolong tambahkan contract token BNB: 0x31351646e2c5479A30f846dFa4297E9Dbe189a63

tolong tambahkan contract token MON: 0xa12C18847c41ECE267155ffAe112b8951AbbcA1C

tolong tambahkan contract token HYPE: 0xBB3B44EB672650Fb4a1Cf6D9dc5d3b7494F333AB

tolong tambahkan contract token ETH: 0x5b0AE944A4Ee6241a5A638C440A0dCD42411bD3C

tolong tambahkan contract token LITVM: 0xF143eCFE3DFEEB4ae188cA4f1c7c7ab0b5F592eb

tolong tambahkan contract token WDEX: 0xEa71393074fFCB6d132B8a2b6028CAF952af03A5

tolong logo buat token BNB, MON, HYPE, ETH, di ambil  langsung dari coinmarketcap dan kalo buat coin zkLTC dan token wzkLTC pakai gambar coin LITECOIN ajah di ambil dari coin marketcap dan   tolong jangan lupa contract Factory, weth9, library, router, multicall wajib di implentasikan ke frontend dan di integrasikan ke blockchain  dan tolong untuk logo token LITVM di atas   dan WDEX di samping sebelah kanan   nya

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://wolfdex.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5747c462-98d1-4762-ad67-4dcacca34a61).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
