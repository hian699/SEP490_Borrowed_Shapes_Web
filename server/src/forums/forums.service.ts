import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ForumThread } from '../entities/ForumThread';
import { ForumCategory } from '../entities/ForumCategory';
import { User } from '../entities/User';
import { ForumThreadVote } from '../entities/ForumThreadVote';
import { CreateForumDto } from './dto/create-forums.dto';
import { UpdateForumDto } from './dto/update-forums.dto';
import { Web$46ForumPostType } from '../entities/Web$46ForumPostType';
import { Web$46ForumThreadStatus } from '../entities/Web$46ForumThreadStatus';
import { GameProfile } from '../entities/GameProfile';

@Injectable()
export class ForumService {
  constructor(private readonly em: EntityManager) { }

  // List: pagination + search + category + sort
  async list({
    page = 1,
    limit = 20,
    q = '',
    categoryId,
    sortBy = 'createdAt',
    order = 'desc',
    month,
    year,
  }: any) {
    const offset = (page - 1) * limit;
    const clauses: string[] = [];
    const params: any[] = [];

    // Search with ILIKE (case-insensitive)
    if (q && q.trim()) {
      clauses.push(`(title ilike ? or content ilike ?)`);
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm);
    }

    if (categoryId) {
      clauses.push(`"categoryId" = ?`);
      params.push(categoryId);
    }

    // Filter by month/year
    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      clauses.push(`t."createdAt" >= ? and t."createdAt" < ?`);
      params.push(startDate, endDate);
    } else if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      clauses.push(`t."createdAt" >= ? and t."createdAt" < ?`);
      params.push(startDate, endDate);
    }

    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

    // Build order clause: isPinned DESC first, then sortBy with order
    const validSortFields = ['score', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    const orderClause = `order by t."isPinned" desc, t."${sortField}" ${sortOrder}`;

    // Select specific columns to avoid leaking sensitive data
    const rows = await this.em.execute(
      `
      select t."id", t."title", t."slug", t."content", t."imageUrl", t."score", 
             t."viewCount", t."isPinned", t."isLocked", t."postType", t."status",
             t."createdAt", t."updatedAt",
             u."id" as "authorId", u."displayName" as "authorName", u."imgUrl" as "authorAvatar",
             a."badgeImageUrl" as "authorBadgeImageUrl",
             c."id" as "categoryId", c."name" as "categoryName", c."slug" as "categorySlug"
      from web."ForumThread" t
      inner join auth."User" u on u."id" = t."authorId"
      left join game."GameProfile" gp on gp."userId" = u."id"
      left join game."Achievement" a on a."id" = gp."equippedAchievementId"
      inner join web."ForumCategory" c on c."id" = t."categoryId"
      ${where}
      ${orderClause}
      limit ? offset ?
      `,
      [...params, limit, offset],
    );

    const countRes = await this.em.execute(
      `select count(1) as cnt from web."ForumThread" t ${where}`,
      params,
    );

    const total = Number(countRes?.[0]?.cnt || 0);

    return {
      items: rows || [],
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Detail + increment viewCount + sanitize author data
  async findOne(id: string) {
    const thread = await this.em.findOne(ForumThread, { id }, { populate: ['authorId', 'categoryId'] });
    if (!thread) throw new NotFoundException('forum.thread_not_found');

    // defensively increment viewCount on the entity and flush
    thread.viewCount = (Number(thread.viewCount) || 0) + 1;
    await this.em.flush();

    const gp = await this.em.findOne(
      GameProfile,
      { userId: thread.authorId },
      { populate: ['equippedAchievement'] },
    );

    const badgeImageUrl =
      gp && (gp as any).equippedAchievement ? (gp as any).equippedAchievement.badgeImageUrl : null;

    // Sanitize user data: exclude email, password, and other sensitive fields
    const sanitizedAuthor = {
      id: thread.authorId.id,
      displayName: thread.authorId.displayName,
      imgUrl: thread.authorId.imgUrl,
      badgeImageUrl,
    };

    const sanitizedCategory = {
      id: thread.categoryId.id,
      name: thread.categoryId.name,
      slug: thread.categoryId.slug,
    };

    // Return sanitized thread
    return {
      id: thread.id,
      title: thread.title,
      slug: thread.slug,
      content: thread.content,
      imageUrl: thread.imageUrl,
      score: thread.score,
      viewCount: thread.viewCount,
      isPinned: thread.isPinned,
      isLocked: thread.isLocked,
      postType: thread.postType,
      status: thread.status,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      author: sanitizedAuthor,
      category: sanitizedCategory,
    };
  }

  // Create — auth required
  async create(dto: CreateForumDto, authorId: string, isAdmin = false) {
    // Validate input
    if ((dto.isPinned !== undefined || dto.isLocked !== undefined) && !isAdmin) {
      throw new ForbiddenException('forum.forbidden_admin_only');
    }
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('forum.title_required');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('forum.content_required');
    }
    if (!dto.categoryId) {
      throw new BadRequestException('forum.category_required');
    }

    // Check author exists
    const author = await this.em.findOne(User, { id: authorId });
    if (!author) throw new BadRequestException('forum.invalid_author');

    // Check category exists (required)
    const category = await this.em.findOne(ForumCategory, { id: dto.categoryId });
    if (!category) throw new BadRequestException('forum.category_not_found');

    // Prepare thread data
    const now = new Date();

    const slug = this.slugify(dto.slug?.trim() || dto.title);

    // Check slug conflict
    const existingSlug = await this.em.findOne(ForumThread, { slug });
    if (existingSlug) {
      throw new BadRequestException('forum.slug_conflict');
    }

    // Create thread
    const thread = this.em.create(ForumThread, {
      title: dto.title.trim(),
      slug,
      categoryId: category,
      authorId: author,
      content: dto.content.trim(),
      imageUrl: dto.imageUrl ?? null,
      postType: dto.postType ?? Web$46ForumPostType.GENERAL,
      isPinned: dto.isPinned ?? false,
      isLocked: dto.isLocked ?? false,
      status: dto.status ?? Web$46ForumThreadStatus.OPEN,
      createdAt: now,
      updatedAt: now,
    });

    await this.em.persistAndFlush(thread);
    return null;
  }

  // Update — author only
  async update(id: string, dto: UpdateForumDto, userId: string, isAdmin = false) {
    const thread = await this.em.findOne(ForumThread, { id }, { populate: ['authorId'] });
    if (!thread) throw new NotFoundException('forum.thread_not_found');

    // Check permission
    if (String(thread.authorId.id) !== String(userId)) {
      throw new ForbiddenException('forum.forbidden_update');
    }

    // Update fields
    if (dto.title) {
      const trimmed = dto.title.trim();
      if (!trimmed) throw new BadRequestException('forum.title_required');
      thread.title = trimmed;
    }

    if (dto.slug) {
      const newSlug = this.slugify(dto.slug.trim() || thread.title);
      if (!newSlug) throw new BadRequestException('forum.slug_required');

      // Check slug conflict (if different from current)
      if (newSlug !== thread.slug) {
        const existingSlug = await this.em.execute(
          `select id from web."ForumThread" where slug = ? and id <> ?`,
          [newSlug, id],
        );
        if (existingSlug?.length) {
          throw new BadRequestException('forum.slug_conflict');
        }
      }
      thread.slug = newSlug;
    }

    if (dto.content) {
      const trimmed = dto.content.trim();
      if (!trimmed) throw new BadRequestException('forum.content_required');
      thread.content = trimmed;
    }

    if (dto.imageUrl !== undefined) {
      thread.imageUrl = dto.imageUrl ?? null;
    }

    // Category: if provided, must exist (required)
    if (dto.categoryId) {
      const category = await this.em.findOne(ForumCategory, { id: dto.categoryId });
      if (!category) throw new BadRequestException('forum.category_not_found');
      thread.categoryId = category;
    }

    if (dto.postType) {
      thread.postType = dto.postType;
    }

    if (dto.status) {
      thread.status = dto.status;
    }

    if (dto.isPinned !== undefined || dto.isLocked !== undefined) {
      if (!isAdmin) {
        throw new ForbiddenException('forum.forbidden_admin_only');
      }
      if (dto.isPinned !== undefined) thread.isPinned = dto.isPinned;
      if (dto.isLocked !== undefined) thread.isLocked = dto.isLocked;
    }

    thread.updatedAt = new Date();

    await this.em.flush();
    return null;
  }

  // Remove — author or ADMIN
  async remove(id: string, userId: string, isAdmin = false) {
    const thread = await this.em.findOne(ForumThread, { id }, { populate: ['authorId'] });
    if (!thread) throw new NotFoundException('forum.thread_not_found');

    // Check permission
    if (!isAdmin && String(thread.authorId.id) !== String(userId)) {
      throw new ForbiddenException('forum.forbidden_delete');
    }

    await this.em.removeAndFlush(thread);
    return null;
  }

  // Vote — value = 1 | -1, toggle behaviour
  async vote(threadId: string, userId: string, value: 1 | -1) {
    const thread = await this.em.findOne(ForumThread, { id: threadId });
    if (!thread) throw new NotFoundException('forum.thread_not_found');

    const user = await this.em.findOne(User, { id: userId });
    if (!user) throw new BadRequestException('forum.invalid_user');

    // Use raw SQL to reliably find existing vote
    const existingRows = await this.em.execute(
      `select "value" from web."ForumThreadVote" where "userId" = ? and "threadId" = ?`,
      [userId, threadId],
    );

    const existingVote = existingRows?.[0];
    const existingValue = existingVote ? Number(existingVote.value) : null;

    if (existingValue === null) {
      // Create new vote
      const vote = this.em.create(ForumThreadVote, {
        threadId: thread,
        userId: user,
        value: String(value) as any,
      } as any);
      thread.score = (thread.score || 0) + value;
      await this.em.persistAndFlush([vote, thread]);
      return { result: 'voted', score: thread.score };
    }

    if (existingValue === value) {
      // Same vote: toggle off (remove)
      await this.em.execute(
        `delete from web."ForumThreadVote" where "userId" = ? and "threadId" = ?`,
        [userId, threadId],
      );
      thread.score = (thread.score || 0) - value;
      await this.em.persistAndFlush([thread]);
      return { result: 'unvoted', score: thread.score };
    } else {
      // Change vote
      await this.em.execute(
        `update web."ForumThreadVote" set "value" = ? where "userId" = ? and "threadId" = ?`,
        [String(value), userId, threadId],
      );
      thread.score = (thread.score || 0) + (value - existingValue);
      await this.em.persistAndFlush([thread]);
      return { result: 'changed', score: thread.score };
    }
  }

  // Helper: generate slug from title
  // I'm not using AI to comment this
  private slugify(s: string): string {
    if (!s) return '';
    // Normalize Unicode: NFD separates characters and diacritics into individual parts
    const normalized = s.normalize('NFD');
    // Remove accents using regex, also convert đ to d, Đ to D
    const withoutAccents = normalized
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .replace(/[\u0300-\u036f]/g, '');
    const lowercase = withoutAccents.toLowerCase();
    // Replace whitespace with dashes
    const withDashes = lowercase.replace(/\s+/g, '-');
    // Remove invalid characters (keep only a-z, 0-9, dashes, underscores)
    const cleaned = withDashes.replace(/[^a-z0-9\-_]/g, '');
    const trimmed = cleaned.replace(/^-+|-+$/g, '');
    return trimmed.slice(0, 200);
  }
}