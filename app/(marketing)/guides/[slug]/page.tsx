import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BlogPostDetail } from "@/components/blog/blog-post-detail";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { blogPosts, users, islands } from "@/drizzle/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();

  const [post] = await db
    .select({
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      coverImage: blogPosts.coverImage,
      metaTitle: blogPosts.metaTitle,
      metaDescription: blogPosts.metaDescription,
      category: blogPosts.category,
      publishedAt: blogPosts.publishedAt,
      authorName: users.name,
    })
    .from(blogPosts)
    .innerJoin(users, eq(blogPosts.authorId, users.id))
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")));

  if (!post) {
    return { title: "Guide Not Found" };
  }

  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt || `Read ${post.title} on VakayGo`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | VakayGo`,
      description,
      url: `https://vakaygo.com/guides/${slug}`,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      authors: [post.authorName || "VakayGo"],
      images: post.coverImage
        ? [{ url: post.coverImage, width: 1200, height: 630, alt: post.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | VakayGo`,
      description,
      images: post.coverImage ? [post.coverImage] : [],
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const db = getDb();

  const [post] = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      content: blogPosts.content,
      coverImage: blogPosts.coverImage,
      category: blogPosts.category,
      tags: blogPosts.tags,
      status: blogPosts.status,
      publishedAt: blogPosts.publishedAt,
      createdAt: blogPosts.createdAt,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
      islandId: blogPosts.islandId,
      islandName: islands.name,
      islandSlug: islands.slug,
    })
    .from(blogPosts)
    .innerJoin(users, eq(blogPosts.authorId, users.id))
    .leftJoin(islands, eq(blogPosts.islandId, islands.id))
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")));

  if (!post) {
    notFound();
  }

  // Related posts
  const related = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      coverImage: blogPosts.coverImage,
      category: blogPosts.category,
      publishedAt: blogPosts.publishedAt,
      authorName: users.name,
    })
    .from(blogPosts)
    .innerJoin(users, eq(blogPosts.authorId, users.id))
    .where(
      and(
        eq(blogPosts.status, "published"),
        ne(blogPosts.slug, slug),
        eq(blogPosts.category, post.category)
      )
    )
    .orderBy(desc(blogPosts.publishedAt))
    .limit(3);

  // Article JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || "",
    image: post.coverImage || "",
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.createdAt?.toISOString(),
    author: {
      "@type": "Person",
      name: post.authorName || "VakayGo",
    },
    publisher: {
      "@type": "Organization",
      name: "VakayGo",
      url: "https://vakaygo.com",
      logo: { "@type": "ImageObject", url: "https://vakaygo.com/logo.png" },
    },
    mainEntityOfPage: `https://vakaygo.com/guides/${slug}`,
  };

  return (
    <>
      <Header />
      <main id="main-content">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <BlogPostDetail post={post} related={related} />
      </main>
      <Footer />
    </>
  );
}
