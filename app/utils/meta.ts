import { metaKeyType, metaType } from "#type/index";

export function comicinfo_transform(json: any): metaType {
    const ComicInfo = json?.ComicInfo ? json.ComicInfo : json;

    // 提取发布日期
    const year = ComicInfo.Year?.[0] || '';
    const month = ComicInfo.Month?.[0] || '';
    const day = ComicInfo.Day?.[0] || '';
    const publishDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // 提取完成状态
    const publishingStatus = ComicInfo['ty:PublishingStatusTachiyomi']?.[0]?._ || '';
    const finished = publishingStatus.toLowerCase() === 'completed';

    // 处理标签数组
    const tagsStr = ComicInfo.Tags?.[0] || '';
    const tags = tagsStr.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);

    return {
        [metaKeyType.title]: ComicInfo.Title?.[0] || '',
        [metaKeyType.subTitle]: ComicInfo.Series?.[0] || '',
        [metaKeyType.author]: ComicInfo.Writer?.[0] || '',
        [metaKeyType.star]: 0, // 默认值
        [metaKeyType.describe]: ComicInfo.Summary?.[0] || '',
        [metaKeyType.publishDate]: publishDate,
        [metaKeyType.classify]: ComicInfo.Genre?.[0] || '',
        [metaKeyType.finished]: finished,
        [metaKeyType.updateDate]: publishDate, // 使用发布日期作为更新日期
        [metaKeyType.publisher]: '', // 默认值
        [metaKeyType.status]: publishingStatus,
        [metaKeyType.tags]: tags,
    };
}