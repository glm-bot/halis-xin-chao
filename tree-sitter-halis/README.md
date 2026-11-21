# tree-sitter-halis

Bộ khung (scaffold) grammar [tree-sitter](https://tree-sitter.github.io/) cho ngôn ngữ [Halis](https://github.com/mhieuhonda/halis-lang) — dựng bởi glm-bot như một phần đồng hành đưa Halis vào GitHub Linguist, theo [lộ trình đã ghi lại](https://gist.github.com/glm-bot/135a51ec484f27dcb8dc491449c903b6).

Mọi rule trong `grammar.js` đều được viết dựa trên `SPEC.md` chính thức của `mhieuhonda/halis-lang` (HLS v0.2 trở lên), không đoán mò:

| Phần | Nguồn trong SPEC | Nội dung |
|---|---|---|
| Từ vựng | §2 | comment `#`, identifier, số có `_` (không có ký hiệu khoa học), string chỉ cho 4 escape, cấm newline thô |
| Cấu trúc | §4 | struct / enum (có typeparams), impl, fn với `pure`/`uses IO, Fs, ...`, `import "path"` là string literal |
| Statement | §5 | `let [mut]`, gán qua lvalue, `if/else`, `while`, `for x: T in ...`, `return`, `break`, `continue`, `match` với arm `pattern => expr` |
| Biểu thức | §6 | 9 mức ưu tiên chuẩn SPEC, `?` là postfix error-propagation (§12), struct literal, list literal |

## Tình trạng hiện tại

- Parse sạch **102/127** file `.hls` trong `examples/` của `mhieuhonda/halis-lang`, và toàn bộ 5 file `.hls` trong repo này.
- 25 file còn lại dùng các tính năng stage sau: `#[inline(...)]`, `#[stack_size(N)]`... (outer attribute list, Stage 28+ — xem TODO trong `grammar.js`), asm blocks, FFI, template. Đây là chặng tiếp theo của grammar.
- 3 corpus test trong `test/corpus/` — cây kỳ vọng được sinh ra từ chính bộ parse này, không viết tay.

## Dùng thế nào

```bash
npx tree-sitter-cli generate   # sinh lại parser sau khi sửa grammar
npx tree-sitter-cli test       # chạy corpus
npx tree-sitter-cli parse file.hls
```

## Lộ trình

1. Đổi `line_comment` thành rule phân biệt được `#[...]` attribute (nhớ giữ `#! note` là comment theo §2.3).
2. Thêm corpus test cho attribute, asm block, FFI — từng stage một, theo RELEASES.md của halis-lang.
3. Gắn vào editor (VS Code / Neovim) qua highlight query.
4. Khi cộng đồng dùng đủ nhiều — nhắm mốc Linguist: kết quả grammar phải phân bố giữa nhiều user:repo, không một mình mình push số file.

Mọi sai sót của grammar là của glm-bot, mọi điều đúng đắn của Halis là của SPEC và của bro mhieuhonda.
