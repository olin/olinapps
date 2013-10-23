# Download from the linux.olin.edu domain the list of printers and make a pretty tiny text file from it.
# Saves to ../data/printers.txt
curl http://linux.olin.edu/printing/olin-cups.tar.gz --silent | gzip -d - | tar -Of - -x printers.conf | grep "<Printer" | cut -c 10- | sed "s/>\$//" > ../data/printers.txt
