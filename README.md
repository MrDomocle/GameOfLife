# Game of Life in JavaScript
Pure HTML+CSS+JavaScript.  
Written in a couple of weeks with a focus on good looks.  
## Feature overview
* Different rules
* Zoom levels
* Pattern library
* Paste RLE or Plaintext patterns from elsewhere
* Pretty fast
## What is this?  
This is Conway's Game of Life, conceived in 1970 by British mathematician John Conway.  

> A common misconception is that complex behaviours come from complex rules. Conway's Game of Life proves this wrong.  

The game consists of a grid of cells that can be live or dead, i.e. on or off.  
Every next generation (step) of this simulation takes the previous one and applies these simple rules:  

* If a live cell has fewer than 2 neighbours (i.e. live cells in a 9x9 area around it, excluding the middle - the Moore neighbourhood), it dies of isolation.  
* If a dead cell has exactly 3 neighbours, a new cell is born.  
* If a live cell has more than 3 neighbours, it dies of overpopulation.  

Everything you will see is a product of those rules, and no other specific logic - and that's what makes it interesting.  

People have built amazingly complex contraptions in the game, and it's Turing complete - meaning you can build a computer that can calculate anything if given enough time. It's even possible to run [Life in Life, in Life.](https://www.youtube.com/watch?v=4lO0iZDzzXk)  

There are many variations on it, from different rulesets (e.g. HighLife, which follows the same rules but cells are also born when they have 6 neighbours), to entirely different cellular automata that, for example, use von Neumann neighbourhoods (diamond-shaped).    

If you want to find out more, check out [Life Wiki](https://conwaylife.com/).  