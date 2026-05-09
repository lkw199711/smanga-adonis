-- 修正 bookmark 唯一键: 加入 userId,使不同用户可以在同一 chapter+page 各自拥有书签
-- 旧唯一键: (chapterId, page)  ->  新唯一键: (userId, chapterId, page)
DROP INDEX "opage";
CREATE UNIQUE INDEX "opage" ON "bookmark"("userId", "chapterId", "page");
