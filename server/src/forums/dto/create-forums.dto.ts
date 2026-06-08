import {
  IsString,
  IsOptional,
  Length,
  IsUUID,
  IsUrl,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ForumPostType } from '../../entities/ForumPostType';
import { ForumThreadStatus } from '../../entities/ForumThreadStatus';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumDto {
  @ApiProperty({
    example: 'How to get over it?',
    minLength: 3,
    maxLength: 200,
  })
  @IsString({ message: 'forum.title_must_be_string' })
  @Length(3, 200, { message: 'forum.title_length_invalid' })
  title!: string;

  @ApiPropertyOptional({
    example: 'how-to-get-over-it',
    minLength: 0,
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'forum.slug_must_be_string' })
  @Length(0, 200, { message: 'forum.slug_length_invalid' })
  @Matches(/^[a-z0-9\-]*$/, { message: 'forum.invalid_slug_format' })
  slug?: string;

  @ApiProperty({
    example: 'I am struggling to get over it. Any tips?',
    minLength: 1,
    maxLength: 20000,
  })
  @IsString({ message: 'forum.content_must_be_string' })
  @Length(1, 20000, { message: 'forum.content_length_invalid' })
  content!: string;

  @ApiProperty({
    example: '3bcdd74c-a56f-4e1a-ad62-581be8d9cdca',
  })
  @IsNotEmpty({ message: 'forum.category_required' })
  @IsUUID('4', { message: 'forum.category_id_invalid' })
  categoryId!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'forum.invalid_image_url' })
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'GENERAL',
    enum: ForumPostType,
  })
  @IsOptional()
  @IsEnum(ForumPostType, { message: 'forum.invalid_post_type' })
  postType?: ForumPostType;

  @ApiPropertyOptional({
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'forum.is_pinned_must_be_boolean' })
  isPinned?: boolean;

  @ApiPropertyOptional({
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'forum.is_locked_must_be_boolean' })
  isLocked?: boolean;

  @ApiPropertyOptional({
    example: 'OPEN',
    enum: ForumThreadStatus,
  })
  @IsOptional()
  @IsEnum(ForumThreadStatus, { message: 'forum.invalid_status' })
  status?: ForumThreadStatus;
}