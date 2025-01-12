# Generates entries for pattern library
# Output in out.txt
# first part is to embed a gif that can be clicked to copy pattern,
# second part is the pattern itself, should be at the end of the html
file = open("out.txt", "w")
string = ""
name = input("Enter name: ")
patid = input("Enter id: ")
gif = input("Enter gif link: ")
file.writelines(f"<img class=\"gif\" src=\"{gif}\" onclick=\"copyLibPattern('{patid}')\">\n<p class=\"pattern-title\"><b>{name}</b></p>")
file.writelines("\n\n-------------------------------------\n\n")
line = "b"
pat = ""
while (line != ""):
    line = input("Enter pattern: ")
    pat += line+"\n"

file.writelines(f"<p class=\"pattern-data\" id=\"{patid}\">{pat}</p>")
file.close()