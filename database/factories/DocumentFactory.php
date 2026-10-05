<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Document;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Document>
 */
class DocumentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(4),
            'category_id' => Category::factory(),
            'body' => '## '.fake()->sentence(3)."\n\n".fake()->paragraph(),
        ];
    }
}
