# test-manga-data

此目录由 `node generate-test-manga.mjs` 生成，用来测试扫描模板、预扫描、自动推荐和本地元数据识别。

根目录:

```
D:\15dev\smanga\smanga-adonis\test-manga-data
```

## Fixture 列表

| 目录                                     | 模板/格式                                     | 用途                           |
| ---------------------------------------- | --------------------------------------------- | ------------------------------ |
| `01-manga-chapter-image`                 | `manga > chapter > image`                     | 现有连载/双层漫画结构          |
| `02-manga-image`                         | `manga > image`                               | 现有单本漫画结构               |
| `03-category-manga-chapter-image`        | `category > manga > chapter > image`          | 分类目录 + 连载漫画            |
| `04-category-manga-image`                | `category > manga > image`                    | 分类目录 + 单本漫画            |
| `05-manga-volume-chapter-image`          | `manga > volume > chapter > image`            | 复杂嵌套目录                   |
| `06-category-manga-volume-chapter-image` | `category > manga > volume > chapter > image` | 分类目录 + 复杂嵌套目录        |
| `07-smanga-metadata`                     | `.smanga/info.json and *-smanga-info`         | SMANGA 自定义元数据            |
| `08-series-json-metadata`                | `series.json`                                 | 本地 series.json 元数据        |
| `09-comicinfo-cbz`                       | `manga > chapter.cbz with ComicInfo.xml`      | 压缩章节和 ComicInfo 元数据    |
| `10-auto-recommend-mixed`                | `mixed`                                       | 自动推荐模板时的混合样本       |
| `11-noise-and-ignore`                    | `noise`                                       | 隐藏目录、空目录、无效文件过滤 |

## 使用建议

- 测试旧逻辑时，可以分别把媒体库路径指向某一个顶层 fixture 目录。
- 测试自动推荐时，优先使用 `10-auto-recommend-mixed`，它故意混合了简单结构、分类结构和复杂嵌套结构。
- 测试 SMANGA 元数据时，使用 `07-smanga-metadata`；其中包含漫画目录内的 `.smanga/info.json`，也包含旁挂的 `*-smanga-info`。
- 测试 ComicInfo 时，使用 `09-comicinfo-cbz`；章节 cbz 内包含 `ComicInfo.xml`。

## 重新生成

```bash
cd D:\15dev\smanga\smanga-adonis
node generate-test-manga.mjs
```

生成结果是确定性的，重新运行会先清空并重建 `test-manga-data`。
