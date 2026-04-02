# 统计分析API

<cite>
**本文档引用的文件**
- [charts_controller.ts](file://app/controllers/charts_controller.ts)
- [logs_controller.ts](file://app/controllers/logs_controller.ts)
- [histories_controller.ts](file://app/controllers/histories_controller.ts)
- [latests_controller.ts](file://app/controllers/latests_controller.ts)
- [routes.ts](file://start/routes.ts)
- [response.ts](file://app/interfaces/response.ts)
- [schema.prisma](file://prisma/mysql/schema.prisma)
- [index.ts](file://app/utils/index.ts)
- [database.ts](file://config/database.ts)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

SManga Adonis 是一个基于 AdonisJS 框架构建的漫画管理系统，提供了完整的统计分析功能。本文档详细介绍了统计分析API的设计与实现，包括图表统计接口（浏览统计、标签统计、排名统计、频率统计）、日志管理接口以及最新阅读记录等分析相关功能。

系统采用现代化的架构设计，使用 Prisma ORM 进行数据库操作，支持 MySQL、PostgreSQL 和 SQLite 数据库。通过统一的响应格式和RESTful API设计，为前端应用提供了丰富的统计数据接口。

## 项目结构

SManga Adonis 项目采用典型的 MVC 架构模式，统计分析功能主要分布在以下模块中：

```mermaid
graph TB
subgraph "API层"
Routes[路由配置]
Controllers[控制器]
end
subgraph "业务逻辑层"
ChartsController[图表控制器]
HistoriesController[历史记录控制器]
LatestsController[最新记录控制器]
LogsController[日志控制器]
end
subgraph "数据访问层"
Prisma[Prisma ORM]
Database[(数据库)]
end
subgraph "工具层"
Response[响应格式]
Utils[工具函数]
end
Routes --> Controllers
Controllers --> Prisma
Prisma --> Database
Controllers --> Response
Controllers --> Utils
```

**图表来源**
- [routes.ts:1-241](file://start/routes.ts#L1-L241)
- [charts_controller.ts:1-160](file://app/controllers/charts_controller.ts#L1-L160)
- [histories_controller.ts:1-270](file://app/controllers/histories_controller.ts#L1-L270)

**章节来源**
- [routes.ts:1-241](file://start/routes.ts#L1-L241)
- [charts_controller.ts:1-160](file://app/controllers/charts_controller.ts#L1-L160)

## 核心组件

### 统计分析控制器

系统的核心统计分析功能由四个主要控制器提供：

1. **ChartsController** - 图表统计控制器
2. **HistoriesController** - 历史记录控制器  
3. **LatestsController** - 最新阅读记录控制器
4. **LogsController** - 日志管理控制器

每个控制器都遵循统一的响应格式规范，确保API的一致性和可预测性。

### 数据模型关系

系统使用Prisma ORM定义了完整的数据模型关系，支持复杂的统计查询：

```mermaid
erDiagram
MANGA {
int mangaId PK
string mangaName
string browseType
int mediaId
datetime createTime
}
TAG {
int tagId PK
string tagName
string tagColor
}
HISTORY {
int historyId PK
int userId
int mangaId
int chapterId
int mediaId
datetime createTime
}
LATEST {
int latestId PK
int userId
int mangaId
int chapterId
int page
int finish
datetime updateTime
}
LOG {
int logId PK
string logType
int logLevel
string message
datetime createTime
}
MANGA ||--o{ HISTORY : "has many"
MANGA ||--o{ LATEST : "has many"
TAG ||--o{ MANGA : "has many"
USER ||--o{ HISTORY : "creates"
USER ||--o{ LATEST : "updates"
```

**图表来源**
- [schema.prisma:163-310](file://prisma/mysql/schema.prisma#L163-L310)

**章节来源**
- [schema.prisma:1-449](file://prisma/mysql/schema.prisma#L1-L449)

## 架构概览

系统采用分层架构设计，确保关注点分离和代码的可维护性：

```mermaid
graph TD
Client[客户端] --> API[API网关]
API --> Auth[认证中间件]
Auth --> Controller[控制器]
Controller --> Service[服务层]
Service --> Repository[数据访问层]
Repository --> Prisma[Prisma ORM]
Prisma --> Database[(数据库)]
subgraph "响应格式"
SResponse[标准响应格式]
ListResponse[列表响应格式]
end
Controller --> SResponse
Controller --> ListResponse
```

**图表来源**
- [response.ts:1-64](file://app/interfaces/response.ts#L1-L64)
- [charts_controller.ts:1-160](file://app/controllers/charts_controller.ts#L1-L160)

## 详细组件分析

### 图表统计控制器 (ChartsController)

ChartsController 提供了四种核心统计功能：

#### 浏览统计 (Browse Statistics)

浏览统计功能根据漫画的浏览类型进行分类统计，支持以下浏览类型：
- flow: 条漫（纵向滚动）
- single: 单页显示
- double: 双页显示
- half: 裁剪显示

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as ChartsController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : GET /chart-browse
Controller->>Prisma : manga.groupBy(browseType)
Prisma->>DB : 执行分组查询
DB-->>Prisma : 返回统计结果
Prisma-->>Controller : 处理后的统计数据
Controller->>Controller : 组装响应格式
Controller-->>Client : {code : 0, data : {...}, message : ''}
```

**图表来源**
- [charts_controller.ts:6-30](file://app/controllers/charts_controller.ts#L6-L30)

#### 标签统计 (Tag Statistics)

标签统计功能统计各个标签的使用频率，支持通过 `slice` 参数限制返回数量：

```mermaid
flowchart TD
Start([请求进入]) --> GetParams[获取slice参数<br/>默认值: 5]
GetParams --> GroupBy[执行分组查询<br/>按tagId分组]
GroupBy --> OrderBy[按使用次数降序排列]
OrderBy --> Take[限制返回数量]
Take --> Enrich[关联标签名称]
Enrich --> Format[格式化响应数据]
Format --> End([返回结果])
```

**图表来源**
- [charts_controller.ts:32-73](file://app/controllers/charts_controller.ts#L32-L73)

#### 排名统计 (Ranking Statistics)

排名统计功能基于历史记录统计漫画的阅读次数排名：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as ChartsController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : GET /chart-ranking?slice=5
Controller->>Prisma : history.groupBy(mangaId)
Prisma->>DB : 查询历史记录
DB-->>Prisma : 返回分组统计
Prisma-->>Controller : 处理后的排名数据
Controller->>Prisma : 关联漫画信息
Prisma->>DB : 查询漫画详情
DB-->>Prisma : 返回漫画信息
Prisma-->>Controller : 完整的排名数据
Controller-->>Client : 排名统计结果
```

**图表来源**
- [charts_controller.ts:75-112](file://app/controllers/charts_controller.ts#L75-L112)

#### 频率统计 (Frequency Statistics)

频率统计功能统计用户过去7天的阅读频率，按日期进行分组：

```mermaid
flowchart TD
Request[接收请求] --> CalcDate[计算7天前日期]
CalcDate --> QueryHistory[查询历史记录]
QueryHistory --> InitDays[初始化7天日期数组]
InitDays --> ProcessData[处理统计数据]
ProcessData --> SortData[按日期排序]
SortData --> FormatResponse[格式化响应]
FormatResponse --> Return[返回结果]
```

**图表来源**
- [charts_controller.ts:114-158](file://app/controllers/charts_controller.ts#L114-L158)

**章节来源**
- [charts_controller.ts:1-160](file://app/controllers/charts_controller.ts#L1-L160)

### 历史记录控制器 (HistoriesController)

历史记录控制器提供了完整的阅读历史管理功能：

#### 分页查询历史记录

支持按用户ID分页查询历史记录，自动处理MySQL和PostgreSQL的差异：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as HistoriesController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : GET /history?page&pageSize
Controller->>Controller : 检测数据库类型
alt PostgreSQL
Controller->>Prisma : 执行PostgreSQL查询
else MySQL
Controller->>Prisma : 执行MySQL查询
end
Prisma->>DB : 查询历史记录
DB-->>Prisma : 返回查询结果
Prisma-->>Controller : 处理后的数据
Controller->>Prisma : 查询最新阅读状态
Prisma->>DB : 查询最新记录
DB-->>Prisma : 返回最新状态
Prisma-->>Controller : 完整的历史数据
Controller-->>Client : 分页历史记录
```

**图表来源**
- [histories_controller.ts:8-46](file://app/controllers/histories_controller.ts#L8-L46)

#### 创建历史记录

当用户阅读漫画章节时，系统自动创建历史记录：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as HistoriesController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : POST /history
Controller->>Controller : 验证请求参数
Controller->>Prisma : 创建历史记录
Prisma->>DB : 插入历史数据
DB-->>Prisma : 返回新记录
Prisma-->>Controller : 新的历史记录
Controller-->>Client : 创建成功
```

**图表来源**
- [histories_controller.ts:126-160](file://app/controllers/histories_controller.ts#L126-L160)

**章节来源**
- [histories_controller.ts:1-270](file://app/controllers/histories_controller.ts#L1-L270)

### 最新阅读记录控制器 (LatestsController)

最新阅读记录控制器专门管理用户的最新阅读进度：

#### 查询最新阅读记录

支持按用户ID查询最新的阅读记录，并计算未观看章节数量：

```mermaid
flowchart TD
Start[查询最新记录] --> GetLatest[获取最新记录]
GetLatest --> CountChapters[统计漫画总章节数]
CountChapters --> GetReadChapters[获取已读章节]
GetReadChapters --> CalcUnwatched[计算未观看章节数]
CalcUnwatched --> FormatData[格式化返回数据]
FormatData --> End[返回结果]
```

**图表来源**
- [latests_controller.ts:8-38](file://app/controllers/latests_controller.ts#L8-L38)

#### 更新阅读进度

用户更新阅读进度时，系统自动处理最新记录的创建或更新：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as LatestsController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : POST /latest
Controller->>Prisma : upsert最新记录
Prisma->>DB : 更新或插入记录
DB-->>Prisma : 返回处理结果
Prisma-->>Controller : 最新记录
Controller-->>Client : 更新成功
```

**图表来源**
- [latests_controller.ts:136-157](file://app/controllers/latests_controller.ts#L136-L157)

**章节来源**
- [latests_controller.ts:1-179](file://app/controllers/latests_controller.ts#L1-L179)

### 日志管理控制器 (LogsController)

日志管理控制器提供了完整的日志CRUD操作：

#### 日志列表查询

支持分页查询日志列表，按创建时间倒序排列：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Controller as LogsController
participant Prisma as Prisma ORM
participant DB as 数据库
Client->>Controller : GET /log?page&pageSize
Controller->>Prisma : 并行查询列表和总数
Prisma->>DB : 查询日志列表
DB-->>Prisma : 返回日志数据
Prisma->>DB : 查询日志总数
DB-->>Prisma : 返回总数
Prisma-->>Controller : 处理后的数据
Controller-->>Client : 日志列表
```

**图表来源**
- [logs_controller.ts:9-22](file://app/controllers/logs_controller.ts#L9-L22)

**章节来源**
- [logs_controller.ts:1-61](file://app/controllers/logs_controller.ts#L1-L61)

## 依赖关系分析

系统的关键依赖关系如下：

```mermaid
graph LR
subgraph "外部依赖"
AdonisJS[AdonisJS框架]
Prisma[Prisma ORM]
MySQL[MySQL驱动]
PostgreSQL[PostgreSQL驱动]
SQLite[SQLite驱动]
end
subgraph "内部模块"
Routes[路由配置]
Controllers[控制器]
Interfaces[接口定义]
Utils[工具函数]
end
Routes --> Controllers
Controllers --> Prisma
Prisma --> MySQL
Prisma --> PostgreSQL
Prisma --> SQLite
Controllers --> Interfaces
Controllers --> Utils
Utils --> Routes
```

**图表来源**
- [routes.ts:1-241](file://start/routes.ts#L1-L241)
- [charts_controller.ts:1-160](file://app/controllers/charts_controller.ts#L1-L160)

**章节来源**
- [routes.ts:1-241](file://start/routes.ts#L1-L241)
- [database.ts:1-24](file://config/database.ts#L1-L24)

## 性能考虑

### 数据库优化策略

1. **索引优化**: 系统在关键字段上建立了适当的索引，如 `userId`、`mangaId`、`chapterId` 等
2. **查询优化**: 使用 `groupBy` 和 `orderBy` 进行高效的统计查询
3. **连接优化**: 通过 `JOIN` 操作减少查询次数
4. **分页优化**: 实现了高效的分页查询机制

### 缓存策略

系统支持多种数据库类型的优化：
- **PostgreSQL**: 使用 `MAX()` 函数处理 `ONLY_FULL_GROUP_BY` 模式
- **MySQL**: 通过 `GROUP BY` 和聚合函数优化查询性能

### 响应格式优化

统一的响应格式确保了API的一致性和可预测性：
- 成功响应: `{ code: 0, data: any, message: '' }`
- 列表响应: `{ code: 0, list: [], count: number, message: '' }`

## 故障排除指南

### 常见问题及解决方案

#### 数据库连接问题

**症状**: API调用失败，出现数据库连接错误
**解决方案**: 
1. 检查数据库配置文件中的连接参数
2. 确认数据库服务正在运行
3. 验证用户权限设置

#### 查询性能问题

**症状**: 统计查询响应缓慢
**解决方案**:
1. 检查数据库索引是否完整
2. 优化查询条件和分页参数
3. 考虑添加适当的数据库索引

#### 统计数据不准确

**症状**: 统计结果与预期不符
**解决方案**:
1. 验证数据完整性
2. 检查时间范围设置
3. 确认用户权限验证

**章节来源**
- [response.ts:1-64](file://app/interfaces/response.ts#L1-L64)
- [index.ts:94-105](file://app/utils/index.ts#L94-L105)

## 结论

SManga Adonis 的统计分析API提供了完整的数据分析功能，包括浏览统计、标签统计、排名统计、频率统计等核心功能。系统采用现代化的架构设计，使用Prisma ORM简化了数据库操作，支持多种数据库类型，并提供了统一的响应格式。

通过合理的数据库设计和查询优化，系统能够高效地处理大量的统计数据。同时，清晰的API设计和完善的错误处理机制确保了系统的稳定性和可靠性。

未来可以考虑添加更多高级统计功能，如趋势分析、用户行为分析等，进一步提升系统的数据分析能力。