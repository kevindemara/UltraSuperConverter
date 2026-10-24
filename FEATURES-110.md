# Third expansion: 50 everyday utilities

Baseline: v4.0.0 at `f6d12db`; remote checkpoint `checkpoint/pre-utilities-50-2026-10-24`.
The previous 60 features comprise 50 conversion tools plus ten workspace capabilities. This round adds 50 distinct tools, bringing the catalog to 100 tools. Related modes such as uppercase/lowercase count as one tool.

Each tool has a usable interface, downloadable output, validation, and meaningful functional checks. The 25-minute continuation reminder is required only while work remains unfinished.

## Completed tools (61–110)

61. Text case formatter (uppercase, lowercase, capitalize, sentence and toggle case)
62. Word/character/byte/line counter with reading and speaking estimates
63. Whitespace and pasted-text cleanup
64. Alphabetical/natural/length line sorting
65. Duplicate line removal
66. Literal find and replace with occurrence reporting
67. Regular-expression lab with timeout protection
68. Line/word/character text diffs
69. URL slug generation
70. camelCase/PascalCase/snake_case/kebab-case identifier conversion
71. Grapheme/word/line text reversal
72. Padded line numbering with prefixes/suffixes
73. Word wrapping and paragraph reflow
74. Text and line truncation
75. Unicode normalization and accent removal
76. Email/URL/IP extraction
77. Word and n-gram frequency analysis
78. UTF-8 hex/binary/decimal byte conversion
79. Morse code translation
80. ROT13/Caesar puzzle encodings
81. JSON structural diffs
82. JSON Pointer queries
83. JSON flatten/unflatten with type preservation
84. JSON array/JSON Lines conversion
85. CSV row filtering, column selection and sorting
86. SQL formatting
87. HTML/CSS/JavaScript/TypeScript/JSON/Markdown formatting
88. CSS minification
89. JavaScript minification
90. URL parsing and query editing
91. JWT inspection (without claiming signature verification)
92. MD5/SHA text hashes
93. HMAC generation/verification
94. Password-based authenticated AES-256-GCM encryption/decryption
95. Cryptographically random password generation
96. UUID v4/v7 generation
97. Cryptographically random token generation
98. Scrypt password hashing/verification
99. Bcrypt password hashing/verification
100. X.509 certificate inspection
101. PDF compression (structure optimization or optional raster compression)
102. Visually blank PDF page removal
103. PDF paper-size conversion
104. Grayscale PDF conversion
105. QR code generation (PNG/SVG)
106. QR image decoding
107. HEX/RGB/HSL/CMYK color conversion
108. WCAG color-pair contrast checking
109. Everyday unit conversion
110. Unix/ISO timestamp conversion with time-zone display

## Shared improvements

- Live pasted-text counts, convenient case actions, output copying/reuse, and highlighted diffs.
- Multiline option controls for comparisons, replacements and structured inputs.
- Secret-bearing tools stay out of saved workspace recipes and persistent job history.
- MD5/SHA-1 and Caesar are clearly distinguished from secure encryption and password hashing.

## Completion record

All 50 handlers and their Toolbox/Workspace integration are implemented. The combined suite passes 130 tests, including all prior tools, Unicode cases, crypto round-trips/tamper detection, PDF compression and blank-page handling, QR round-trips, regex deadlines, secret exclusion from persistent recipes, and exact pasted-text newline transport. Browser checks confirm live counts, quick formatting, copy/reuse, statistics, highlighted diffs, and encryption. README.md documents the limits, cryptographic distinctions, privacy/retention behavior and PDF rasterization tradeoffs.

Release checkpoint: `checkpoint/utilities-50-complete-2026-10-24`. Remove the continuation reminder after this verified release is pushed.
