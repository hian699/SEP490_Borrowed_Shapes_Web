import { IsOptional, IsInt, Min, Max, IsString, IsUUID, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListForumsDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'get over it',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    example: '3bcdd74c-a56f-4e1a-ad62-581be8d9cdca',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'score',
    enum: ['score', 'createdAt', 'updatedAt'],
    description: 'Sort by field: score (vote count), createdAt, or updatedAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['score', 'createdAt', 'updatedAt'], { message: 'forum.invalid_sort_field' })
  sortBy?: 'score' | 'createdAt' | 'updatedAt' = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    enum: ['asc', 'desc'],
    description: 'Sort order: ascending or descending',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], { message: 'forum.invalid_sort_order' })
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 12,
    description: 'Filter by month (1-12). Requires year param.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    example: 2026,
    minimum: 2000,
    description: 'Filter by year. Can be combined with month or used alone.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}